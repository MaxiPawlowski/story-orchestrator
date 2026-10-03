import { getContext, sendSystemChatMessage } from "@services/STAPI";
import type { RuntimeManager } from "./runtimeManager";
import { renderBlackboardMemo } from "./blackboardMemo";
import { loadChapterKit } from "./chapterPort";
import { isEstablished, type MemoryEntry } from "@memory/index";
import { CP_AUTHOR_ONLY_TEXT, MEMORY_TIER_LABELS, SO_MEM_AUTHOR_ONLY_TEXT } from "./narrative";
import { requestBriefing } from "./briefingRequest";
import { CP_HELP_STRING, SO_MEM_HELP_STRING, STORY_HELP_STRING, STORY_VERBS, soMemHelpText, storyHelpText } from "./slashHelp";

type SlashArgs = Record<string, unknown>;
type SlashCommandFactory = { fromProps: (props: Record<string, unknown>) => unknown };
type SlashCommandParserHost = { addCommandObject: (command: unknown) => void; commands?: Record<string, unknown> };
type SlashArgumentFactory = { fromProps: (props: Record<string, unknown>) => unknown };
type SlashArgumentTypes = { STRING: unknown };

const isObjectLike = (value: unknown) => value !== null && (typeof value === "object" || typeof value === "function");
const hasSlashCommandFactory = (value: unknown): value is SlashCommandFactory => isObjectLike(value) && typeof (value as SlashCommandFactory).fromProps === "function";
const hasSlashCommandParser = (value: unknown): value is SlashCommandParserHost => isObjectLike(value) && typeof (value as SlashCommandParserHost).addCommandObject === "function";
const hasSlashArgumentFactory = (value: unknown): value is SlashArgumentFactory => isObjectLike(value) && typeof (value as SlashArgumentFactory).fromProps === "function";
const hasSlashArgumentTypes = (value: unknown): value is SlashArgumentTypes => value !== null && typeof value === "object" && "STRING" in value;

const show = (message: string) => {
  window.toastr?.info?.(message, "Story Orchestrator");
  return message;
};

const dump = (message: string) => {
  if (!sendSystemChatMessage(message)) show(message);
  return message;
};

const buildEnumList = (context: ReturnType<typeof getContext>, values: Array<[string, string]>): unknown[] =>
  values.map(([value, description]) => new context.SlashCommandEnumValue(value, description));

let lastMemListIds: string[] = [];

const resolveMemId = (token: string | undefined): string | undefined => {
  if (!token) return undefined;
  if (/^\d+$/.test(token)) return lastMemListIds[Number(token) - 1];
  return token;
};

const partsOf = (value: string | string[]) => (Array.isArray(value) ? value.join(" ") : String(value ?? "")).trim().split(/\s+/).filter(Boolean);

const stringArgument = (context: ReturnType<typeof getContext>, props: Record<string, unknown>): unknown[] => {
  const slashArgument = context.SlashCommandArgument;
  return hasSlashArgumentFactory(slashArgument) && hasSlashArgumentTypes(context.ARGUMENT_TYPE)
    ? [slashArgument.fromProps({ typeList: [context.ARGUMENT_TYPE.STRING], isRequired: false, acceptsMultiple: true, ...props })]
    : [];
};

const authorView = (manager: RuntimeManager) => manager.getSnapshot().ui?.authorView === true;

async function cpCommand(manager: RuntimeManager, value: string | string[]) {
  if (!authorView(manager)) return show(CP_AUTHOR_ONLY_TEXT);
  const parts = partsOf(value);
  const command = parts[0] ?? "list";
  if (command === "list") {
    const snapshot = manager.getSnapshot();
    return dump(snapshot.checkpoints.map((checkpoint) => `${checkpoint.active ? "●" : checkpoint.visited ? "✔" : "○"} ${checkpoint.id} ${checkpoint.name}`).join("\n") || "No story loaded");
  }
  if (command === "state") {
    return dump(renderBlackboardMemo(manager.getSnapshot()));
  }
  if (command === "activate") {
    const id = parts[1];
    if (!id) return show("Usage: /cp activate <id>");
    await manager.activateCheckpoint(id);
    return show(manager.getSnapshot().status);
  }
  if (command === "set") {
    const key = parts[1];
    const raw = parts.slice(2).join(" ");
    if (!key || !raw) return show("Usage: /cp set <quality> <value>");
    await manager.setQuality(key, raw);
    return show(manager.getSnapshot().status);
  }
  if (command === "extract") {
    const response = parts.slice(1).join(" ");
    await manager.runExtractionNow(response || undefined);
    return show(manager.getSnapshot().status);
  }
  if (command === "expand") {
    const response = parts.slice(1).join(" ");
    await manager.runExpansionNow(response || undefined, !response);
    return show(manager.getSnapshot().status);
  }
  if (command === "converge") {
    const snapshot = manager.getSnapshot();
    if (!snapshot.convergence.length) return show("No convergence anchors with progress qualities.");
    return dump(snapshot.convergence.map((entry) => `${entry.reached ? "✔" : "○"} ${entry.anchorId} ${entry.progress}/${entry.threshold}`).join("\n"));
  }
  if (command === "chapters" || command === "seal" || command === "unseal") return (await loadChapterKit()).chapterSlash(manager, `cp-${command}`, parts[1], dump, show);
  if (command === "memorize") {
    const ok = await manager.memorizeChat();
    if (!ok) return show(manager.getSnapshot().memory.backfill?.lastError ?? "Memorize backlog could not start.");
    return show(manager.getSnapshot().status);
  }
  return dump("Author commands: /cp list, /cp state, /cp activate <id>, /cp set <quality> <value>, /cp converge, /cp chapters, /cp seal, /cp unseal <recordId>"
    + " · debug: /cp extract [response], /cp expand [response] · players want /story");
}

async function memCommand(manager: RuntimeManager, value: string | string[]) {
  const parts = partsOf(value);
  const command = parts[0] ?? "list";
  const author = authorView(manager);
  if (command === "list") {
    const playerVisible = (entry: MemoryEntry) => (!entry.foldedInto || isEstablished(entry)) && entry.provenance?.validity !== "conflicted";
    const entries = manager.getSnapshot().memory.entries.filter((entry) => !entry.supersededBy && (author ? !entry.foldedInto : playerVisible(entry)));
    if (!entries.length) return show("No memory entries.");
    lastMemListIds = entries.map((entry) => entry.id);
    return dump(entries.map((entry, index) => `${index + 1}. ${entry.pinned ? "📌 " : ""}[${author ? entry.tier : MEMORY_TIER_LABELS[entry.tier]}] ${entry.text}`).join("\n"));
  }
  if (command === "pin") {
    const id = resolveMemId(parts[1]);
    const state = (parts[2] ?? "on").toLowerCase();
    if (!id) return show("Usage: /so-mem pin <number|id> on|off — run /so-mem list first for numbers");
    await manager.setMemoryPinned(id, state !== "off");
    return show(`${state !== "off" ? "Pinned" : "Unpinned"} memory ${parts[1]}`);
  }
  if (command === "exclude") {
    const id = resolveMemId(parts[1]);
    if (!id) return show("Usage: /so-mem exclude <number|id> — run /so-mem list first for numbers");
    await manager.excludeMemoryEntry(id);
    return show(`Excluded memory ${parts[1]}`);
  }
  if (command === "backlog") {
    if (!author) return show(SO_MEM_AUTHOR_ONLY_TEXT);
    const ok = await manager.memorizeChat();
    if (!ok) return show(manager.getSnapshot().memory.backfill?.lastError ?? "Memorize backlog could not start.");
    return show(manager.getSnapshot().status);
  }
  return dump(soMemHelpText());
}

export const NO_STORY_BRIEFING = "No story is playing in this chat.";
export const NO_BRIEFING_WRITTEN = "This story has no briefing.";

async function storyCommand(manager: RuntimeManager, value: string | string[]) {
  const parts = partsOf(value);
  const command = parts[0] ?? "recap";
  if (command === "recap") {
    const narrative = manager.getNarrativeStatus();
    return dump(`${narrative.title}\n\n${narrative.text}`);
  }
  if (command === "threads") {
    const threads = manager.getNarrativeStatus().sections.find((section) => section.id === "threads")?.lines ?? [];
    return dump(threads.length ? threads.map((thread) => `• ${thread}`).join("\n") : "No open threads right now.");
  }
  if (command === "intro") {
    const briefing = manager.getSnapshot().briefing;
    if (!briefing) return show(NO_STORY_BRIEFING);
    if (!briefing.view) return show(NO_BRIEFING_WRITTEN);
    requestBriefing();
    return "";
  }
  if (command === "flag") {
    await manager.flagMoment(parts.slice(1).join(" "));
    return show("Flagged this moment.");
  }
  if (command === "chapters" || command === "chapter" || command === "chronicle") return (await loadChapterKit()).chapterSlash(manager, command, parts[1], dump, show);
  return dump(storyHelpText());
}

export function registerSlashCommands(manager: RuntimeManager): boolean {
  const context = getContext();
  const parser = context.SlashCommandParser;
  const slashCommand = context.SlashCommand;
  if (!hasSlashCommandParser(parser) || !hasSlashCommandFactory(slashCommand)) return false;

  parser.addCommandObject(slashCommand.fromProps({
    name: "cp",
    aliases: ["checkpoint"],
    rawQuotes: true,
    unnamedArgumentList: stringArgument(context, { description: "Story Orchestrator command" }),
    callback: (_args: SlashArgs, value: string | string[]) => cpCommand(manager, value),
    helpString: CP_HELP_STRING,
  }));

  parser.addCommandObject(slashCommand.fromProps({
    name: "so-mem",
    rawQuotes: true,
    unnamedArgumentList: stringArgument(context, { description: "Story Orchestrator memory command" }),
    callback: (_args: SlashArgs, value: string | string[]) => memCommand(manager, value),
    helpString: SO_MEM_HELP_STRING,
  }));

  // The player-safe surface: where am I, what is open, mark this moment. No ids, no debug verbs,
  // nothing that steers the story — /cp stays whole, but it is an author tool.
  parser.addCommandObject(slashCommand.fromProps({
    name: "story",
    rawQuotes: true,
    unnamedArgumentList: stringArgument(context, {
      description: STORY_VERBS.map((entry) => entry.usage.replace("/story ", "")).join(" | "),
      enumList: buildEnumList(context, STORY_VERBS.map((entry) => [entry.verb, entry.what])),
    }),
    callback: (_args: SlashArgs, value: string | string[]) => storyCommand(manager, value),
    helpString: STORY_HELP_STRING,
  }));

  return Boolean(parser.commands?.cp && parser.commands?.["so-mem"] && parser.commands?.story);
}
