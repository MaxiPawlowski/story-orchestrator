import { getContext, sendSystemChatMessage } from "@services/STAPI";
import type { RuntimeManager } from "./runtimeManager";
import { renderBlackboardMemo } from "./blackboardMemo";

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

export function registerSlashCommands(manager: RuntimeManager): boolean {
  const context = getContext();
  const parser = context.SlashCommandParser;
  const slashCommand = context.SlashCommand;
  const slashArgument = context.SlashCommandArgument;
  if (!hasSlashCommandParser(parser) || !hasSlashCommandFactory(slashCommand)) return false;
  const unnamedArgumentList = hasSlashArgumentFactory(slashArgument) && hasSlashArgumentTypes(context.ARGUMENT_TYPE) ? [slashArgument.fromProps({
    description: "Story Orchestrator command",
    typeList: [context.ARGUMENT_TYPE.STRING],
    isRequired: false,
    acceptsMultiple: true,
  })] : [];

  parser.addCommandObject(slashCommand.fromProps({
    name: "cp",
    aliases: ["checkpoint"],
    rawQuotes: true,
    unnamedArgumentList,
    callback: async (_args: SlashArgs, value: string | string[]) => {
      const raw = Array.isArray(value) ? value.join(" ") : String(value ?? "");
      const parts = raw.trim().split(/\s+/).filter(Boolean);
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
      if (command === "memorize") {
        const ok = await manager.memorizeChat();
        if (!ok) return show(manager.getSnapshot().memory.backfill?.lastError ?? "Memorize backlog could not start.");
        return show(manager.getSnapshot().status);
      }
      return dump("Author commands: /cp list, /cp state, /cp activate <id>, /cp set <quality> <value>, /cp converge · debug: /cp extract [response], /cp expand [response] · players want /story");
    },
    helpString: "Story Orchestrator author tools (spoils the story — players want /story): list, state, activate <id>, set <quality> <value>, converge; debug: extract [response], expand [response]",
  }));

  const memArgumentList = hasSlashArgumentFactory(slashArgument) && hasSlashArgumentTypes(context.ARGUMENT_TYPE) ? [slashArgument.fromProps({
    description: "Story Orchestrator memory command",
    typeList: [context.ARGUMENT_TYPE.STRING],
    isRequired: false,
    acceptsMultiple: true,
  })] : [];

  parser.addCommandObject(slashCommand.fromProps({
    name: "so-mem",
    rawQuotes: true,
    unnamedArgumentList: memArgumentList,
    callback: async (_args: SlashArgs, value: string | string[]) => {
      const raw = Array.isArray(value) ? value.join(" ") : String(value ?? "");
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      const command = parts[0] ?? "list";
      if (command === "list") {
        const entries = manager.getSnapshot().memory.entries.filter((entry) => !entry.supersededBy && !entry.foldedInto);
        if (!entries.length) return show("No memory entries.");
        lastMemListIds = entries.map((entry) => entry.id);
        return dump(entries.map((entry, index) => `${index + 1}. ${entry.pinned ? "📌 " : ""}[${entry.tier}] ${entry.text}`).join("\n"));
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
        const ok = await manager.memorizeChat();
        if (!ok) return show(manager.getSnapshot().memory.backfill?.lastError ?? "Memorize backlog could not start.");
        return show(manager.getSnapshot().status);
      }
      return dump("Commands: /so-mem list, /so-mem pin <number|id> on|off, /so-mem exclude <number|id>, /so-mem backlog");
    },
    helpString: "Story Orchestrator v2 memory commands: list, pin <number|id> on|off, exclude <number|id>, backlog",
  }));

  // The player-safe surface: where am I, what is open, mark this moment. No ids, no debug verbs,
  // nothing that steers the story (D1) — /cp stays whole, but it is an author tool.
  const storyArgumentList = hasSlashArgumentFactory(slashArgument) && hasSlashArgumentTypes(context.ARGUMENT_TYPE) ? [slashArgument.fromProps({
    description: "recap | threads | flag [note]",
    typeList: [context.ARGUMENT_TYPE.STRING],
    isRequired: false,
    acceptsMultiple: true,
    enumList: buildEnumList(context, [
      ["recap", "where the story is right now"],
      ["threads", "what is still open"],
      ["flag", "mark this moment for later review"],
    ]),
  })] : [];

  parser.addCommandObject(slashCommand.fromProps({
    name: "story",
    rawQuotes: true,
    unnamedArgumentList: storyArgumentList,
    callback: async (_args: SlashArgs, value: string | string[]) => {
      const raw = Array.isArray(value) ? value.join(" ") : String(value ?? "");
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      const command = parts[0] ?? "recap";
      if (command === "recap") {
        const narrative = manager.getNarrativeStatus();
        return dump(`${narrative.title}\n\n${narrative.text}`);
      }
      if (command === "threads") {
        const threads = manager.getOpenArcs();
        return dump(threads.length ? threads.map((thread) => `• ${thread}`).join("\n") : "No open threads right now.");
      }
      if (command === "flag") {
        await manager.flagMoment(parts.slice(1).join(" "));
        return show("Flagged this moment.");
      }
      return dump("Commands: /story recap, /story threads, /story flag [note]");
    },
    helpString: "Story Orchestrator: recap (where the story is), threads (what is still open), flag [note] (mark this moment for review)",
  }));

  return Boolean(parser.commands?.cp && parser.commands?.["so-mem"] && parser.commands?.story);
}
