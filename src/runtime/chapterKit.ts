import type { NormalizedStoryV2 } from "@engine/index";
import { estimateTokens } from "@memory/budget";
import { renderChronicle } from "@memory/chronicle";
import type { ArcEntry, ChapterRecord, EraLine, MemoryEntry } from "@memory/types";
import { recallCandidates, recallMentions, renderRecall, selectRecall } from "@memory/archiveRecall";
import { ARC_OPEN_INJECT_LIMIT, DEFAULT_DEDUP_THRESHOLDS, labelMemoryBlock, memoryExtensionKey, openArcTexts, type ScoreContext } from "@memory/index";
import { buildChapterView, chapterNumber, chapterOf, chapterSettings, eraTarget, isEraId, jumpSeal, liveSkip, playerTitleOf, sealTarget, type ChapterSettings, type SealSkip } from "./chapters";
import { sealAtState, type ChapterHost, type ChapterPort } from "./chapterPort";
import { withholds } from "./generationLifecycle";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { PromptHost, VectorHost } from "./hostPorts";
import { commitRecordBridge, markRecapSeen, pendingBridge, pushSealSkip, unfoldAt } from "@memory/chapterUnfold";

import { chronicleMarkdown } from "@memory/chronicle";
import { getContext, registerHostMacro, showChoicePopup, showTextPopup, unregisterHostMacro } from "@services/STAPI";
import { exportState } from "./stateExport";
import { previouslyText } from "./narrative";
import { beginRun } from "./runToken";
import { log } from "@utils/log";
import type { RuntimeManager } from "./runtimeManager";
import type { MemoryRuntimeState } from "./types";

export { chronicleMarkdown };
export { buildChapterView };

export async function chapterSlash(manager: RuntimeManager, command: string, arg: string | undefined, dump: (text: string) => string, show: (text: string) => string): Promise<string> {
  const snapshot = manager.getSnapshot();
  const records = snapshot.memory.chapters ?? [];
  if (command === "cp-chapters") {
    return dump(records.map((record) => `${record.id} [${record.status}] ${record.title} · messages ${record.range.from}-${record.range.to}`).join("\n") || "No chapter sealed yet.");
  }
  if (command === "cp-seal") {
    const record = await manager.chapters.sealNow();
    return show(record ? `Sealed ${record.title}` : "Nothing to seal: the story declares no chapter here, or a seal is already running.");
  }
  if (command === "cp-unseal") return show((await manager.chapters.unseal(arg ?? "")) ? `Unsealed ${arg}` : "Usage: /cp unseal <recordId> — only the newest record can be unsealed");
  if (command === "chapters") return dump(chapterListText(manager.getStory(), records, snapshot.activeCheckpointId ?? undefined));
  if (command === "chapter") {
    const parts = recordsForChapter(manager.getStory(), records, Number(arg));
    const text = parts.map((record) => `${record.playerTitle}\n\n${record.summary}${record.epilogue ? `\n\n${record.epilogue}` : ""}`).join("\n\n");
    return dump(text || "Usage: /story chapter <n> — /story chapters lists them");
  }
  const story = manager.getStory();
  const text = chronicleMarkdown(snapshot.storyTitle ?? "Story", records, { author: snapshot.ui.authorView, number: (record) => chapterNumber(story, record.chapterId) });
  const copied = { ok: "The chronicle is on your clipboard", fallback: "Could not reach the clipboard; the chronicle is in the console" };
  await exportState({ writeClipboard: (value) => navigator.clipboard.writeText(value), toast: window.toastr ?? {}, log: (value) => log.info(value) }, text, copied);
  return text;
}

export function showPreviously(port: ChapterPort): boolean {
  const memory = port.host.memory();
  const record = (memory.chapters ?? []).at(-1);
  if (!record || !chapterSettings(memory.settings.chapters).recap || record.recapSeenAt !== undefined) return false;
  port.host.patch({ chapters: markRecapSeen(memory.chapters ?? [], record.id, chatLastMessageId()) });
  void port.host.save();
  showTextPopup(previouslyText(record.playerTitle, record.summary), { okButton: "Continue" });
  return true;
}

export function registerChapterMacros(manager: RuntimeManager): () => void {
  const macros: Array<[string, () => string, string]> = [
    ["story_chapter", () => manager.getCachedSnapshot().chapters?.current?.playerTitle ?? "(none)", "current chapter"],
    ["story_chapter_number", () => String(manager.getCachedSnapshot().chapters?.current?.number || "(none)"), "current chapter number"],
    ["story_so_far", () => manager.chapters.storySoFar() || "(none)", "chronicle + this chapter + open threads"],
    ["story_previously", () => manager.getCachedSnapshot().chapters?.records.at(-1)?.summary ?? "(none)", "the last ended chapter's summary"],
  ];
  macros.forEach(([key, read, what]) => registerHostMacro(key, read, `Story Orchestrator: ${what}`));
  return () => macros.forEach(([key]) => unregisterHostMacro(key));
}

const chatLastMessageId = (): number => {
  const chat = getContext()?.chat;
  return Array.isArray(chat) ? chat.length - 1 : -1;
};

const settingsOf = (host: ChapterHost) => chapterSettings(host.memory().settings.chapters);
const recordsOf = (host: ChapterHost) => host.memory().chapters ?? [];

export const injects = (host: ChapterHost): boolean => settingsOf(host).storySoFar && (host.deps.getStory()?.memory?.story_so_far ?? "block") === "block";

const skipOf = (host: ChapterHost, pathLength: number) => liveSkip(host.memory().chapterSealSkip, pathLength);

export function due(host: ChapterHost) {
  const state = host.deps.getState();
  const story = host.deps.getStory();
  const settings = settingsOf(host);
  if (!state) return null;
  if (story && !story.chapters?.length) return eraTarget(story, recordsOf(host), host.memory(), state.lastMessageId, state.visitedPath, settings);
  return settings.seal ? sealTarget(story, state.activeCheckpointId, recordsOf(host), state.visitedPath, skipOf(host, state.visitedPath.length)) : null;
}

export const recallText = (chat: readonly unknown[], objective: string): string => {
  const turn = [...chat].reverse().find((row): row is { mes: string } => Boolean(row) && (row as { is_user?: unknown }).is_user === true && typeof (row as { mes?: unknown }).mes === "string");
  return [turn?.mes ?? "", objective].filter((part) => part.trim()).join("\n");
};

export async function recallBand(host: VectorHost, query: string, candidates: readonly MemoryEntry[]): Promise<Set<string> | null> {
  if (!candidates.length || (await host.capabilityState("vectors")) === "absent") return null;
  const collectionId = `so_recall_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  try {
    await host.vectorInsert(collectionId, candidates.map((entry, index) => ({ hash: index, text: entry.text, index })), host.source);
    const matches = await host.vectorQuery(collectionId, query, candidates.length, DEFAULT_DEDUP_THRESHOLDS.cosineSameTopic, host.source);
    return new Set(matches.flatMap((match) => (candidates[match.index] ? [candidates[match.index].id] : [])));
  } catch (error) {
    log.warn("chapters: archive recall vectors unavailable, using keyword overlap", error);
    return null;
  } finally {
    try {
      await host.vectorPurge(collectionId);
    } catch (error) {
      log.warn("chapters: the temporary recall collection could not be purged", error);
    }
  }
}

export function releaseRecall(port: ChapterPort) {
  if (!port.recalled) return;
  port.recalled = false;
  port.host.coordinator.updateInjection();
}

export async function recall(port: ChapterPort, chat: readonly unknown[], type: unknown): Promise<number> {
  releaseRecall(port);
  const { host } = port;
  const memory = host.memory();
  const story = host.deps.getStory();
  const state = host.deps.getState();
  const settings = settingsOf(host);
  if (!story || !state || !settings.archiveRecall || !memory.settings.enabled || withholds(type) || !recordsOf(host).length) return 0;
  const text = recallText(chat, story.checkpointById[state.activeCheckpointId]?.objective ?? "");
  const candidates = recallCandidates(memory.entries, text);
  if (!candidates.length) return 0;
  const run = beginRun(host.deps.ownership);
  const semantic = await recallBand(host.deps.hosts.vectors, text, candidates);
  if (!run.stillOwns()) return 0;
  const live = host.memory();
  const context: ScoreContext = {
    boundary: state.boundary, lastMessageId: state.lastMessageId, turnText: text, turnEntities: recallMentions(live.entries, text),
    openArcs: openArcTexts(live.arcs, ARC_OPEN_INJECT_LIMIT), weights: live.settings.scoreWeights,
  };
  const lines = selectRecall(recallCandidates(live.entries, text), recordsOf(host), context, { tokens: settings.recallTokens, semantic });
  if (!lines.length) return 0;
  const key = memoryExtensionKey("scene_history");
  const current = host.deps.hosts.injection.readInjectedPromptBlocks().find((block) => block.key === key)?.value ?? "";
  const recalled = renderRecall(lines);
  host.deps.hosts.prompt.setStoryExtensionPrompt(key, current ? `${current}\n${recalled}` : labelMemoryBlock("scene_history", recalled), live.settings.injectionDepths.scene_history);
  port.recalled = true;
  host.deps.chapterHost?.journal(`recalled ${lines.length} archived ${lines.length === 1 ? "memory" : "memories"}`, lines.map((line) => `${line.recordId}:${line.entryId}`).join(", "));
  return lines.length;
}

export type JumpDecision = "none" | "seal" | "skip" | "cancel";

export async function confirmChapterJump(port: ChapterPort, targetId: string): Promise<JumpDecision> {
  const state = port.host.deps.getState();
  const story = port.host.deps.getStory();
  const target = state && settingsOf(port.host).seal ? jumpSeal(story, state, recordsOf(port.host), targetId, skipOf(port.host, state.visitedPath.length)) : null;
  if (!state || !target) return "none";
  const into = chapterOf(story, targetId);
  const text = `Jumping to ${story?.checkpointById[targetId]?.name ?? targetId}${into ? ` (${into.title})` : ""} leaves the chapter ${target.chapter.title}. `
    + "A jump is not proof the chapter was played, so it is sealed into a record only if you say so.";
  const run = beginRun(port.host.deps.ownership);
  const choice = await showChoicePopup(text, { okButton: { id: "seal" as const, label: "Seal it, then jump" }, choices: [{ id: "skip" as const, label: "Jump without sealing" }] });
  if (!choice || !run.stillOwns()) return "cancel";
  if (choice === "seal") await port.seal(target, sealAtState(state, { pathLength: state.visitedPath.length + 1, path: [...state.visitedPath, targetId], activeCheckpointId: targetId }));
  return choice;
}

export function markSealSkip(port: ChapterPort, skip: SealSkip) {
  port.host.patch({ chapterSealSkip: pushSealSkip(port.host.memory().chapterSealSkip, skip) });
  void port.host.save();
}

export function returning(host: ChapterHost): Map<string, string> {
  const state = host.deps.getState();
  const settings = settingsOf(host);
  return state && settings.seal ? returningLines(host.deps.getStory(), recordsOf(host), state.visitedPath, state.lastMessageId, settings.dossierWindow) : new Map();
}

export function storySoFar(host: ChapterHost): string {
  const memory = host.memory();
  const story = host.deps.getStory();
  const chapter = chapterOf(story, host.deps.getState()?.activeCheckpointId);
  return story ? storySoFarText({ records: recordsOf(host), eras: memory.chronicle?.eras ?? [], canon: memory.canon && !memory.canon.stale ? memory.canon.text : "",
    chapterTitle: chapter ? playerTitleOf(chapter) : null, threads: memory.arcs.filter((arc) => arc.status === "open"), settings: settingsOf(host) }) : "";
}

export function inject(port: ChapterPort, prompt: PromptHost, on: boolean): Map<string, string> {
  const { key, depth } = INJECTION_REGISTRY.storySoFar;
  const text = on && injects(port.host) ? storySoFar(port.host) : "";
  if (text) prompt.setStoryExtensionPrompt(key, text, depth);
  else prompt.clearStoryExtensionPrompt(key);
  return on ? returning(port.host) : new Map();
}

export function carryBridge(port: ChapterPort, type: unknown) {
  const memory = port.host.memory();
  const bridge = !withholds(type) && memory.settings.enabled ? pendingBridge(memory.chapters ?? []) : null;
  port.carried = bridge?.recordId ?? null;
  if (bridge) port.host.deps.hosts.prompt.setStoryExtensionPrompt(INJECTION_REGISTRY.chapterBridge.key, bridge.text, INJECTION_REGISTRY.chapterBridge.depth);
}

export function commitBridge(port: ChapterPort, rendered: boolean) {
  releaseRecall(port);
  const carried = port.carried;
  port.carried = null;
  port.host.deps.hosts.prompt.clearStoryExtensionPrompt(INJECTION_REGISTRY.chapterBridge.key);
  if (!rendered || !carried || pendingBridge(recordsOf(port.host))?.recordId !== carried) return;
  port.host.patch({ chapters: commitRecordBridge(recordsOf(port.host), carried, chatLastMessageId()) });
  void port.host.save();
}

export { unfoldAt };

const coveredBy = (records: readonly ChapterRecord[], eras: readonly { recordIds: string[]; text: string }[], block: string): ChapterRecord[] =>
  (block ? records.filter((record) => block.includes(record.short) || block.includes(record.summary) || eras.some((era) => era.recordIds.includes(record.id) && block.includes(era.text))) : []);

export function foldPreview(memory: MemoryRuntimeState, story: NormalizedStoryV2 | null, blocks: ReadonlyArray<{ key: string; value: string }>, chatLength: number): number {
  const records = memory.chapters ?? [];
  if (!records.length || !chapterSettings(memory.settings.chapters).fold) return 0;
  const block = blocks.find((entry) => entry.key === INJECTION_REGISTRY.storySoFar.key)?.value ?? "";
  return foldRange(coveredBy(records, memory.chronicle?.eras ?? [], block), story, chapterSettings(memory.settings.chapters).foldEras)
    .reduce((sum, range) => sum + Math.max(0, Math.min(range.to, chatLength - 1) - range.from + 1), 0);
}

export function fold(host: ChapterHost, rows: FoldRow[], type: unknown, live: readonly unknown[]): FoldOutcome | null {
  const records = recordsOf(host);
  if (!records.length || !settingsOf(host).fold || withholds(type)) return null;
  const block = host.deps.hosts.injection.readInjectedPromptBlocks().find((entry) => entry.key === INJECTION_REGISTRY.storySoFar.key)?.value ?? "";
  const covered = coveredBy(records, host.memory().chronicle?.eras ?? [], block);
  if (!covered.length) return null;
  const ids = new Map<unknown, number>();
  live.forEach((message, index) => {
    const extra = (message as { extra?: unknown } | null)?.extra;
    if (extra && typeof extra === "object") ids.set(extra, index);
  });
  return foldRows(rows, (row) => ids.get(row.extra) ?? null, foldRange(covered, host.deps.getStory(), settingsOf(host).foldEras));
}

const IGNORE = Symbol.for("ignore");

const clip = (text: string, tokens: number): string => {
  if (estimateTokens(text) <= tokens) return text;
  const cut = text.slice(0, Math.max(0, tokens * 4));
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 0)).trimEnd()}…`;
};

export const chapterCanonText = (canon: string): string => canon.replace(/\n?\s*ESTABLISHED FACTS\s*:[\s\S]*$/i, "").trim();

export interface StorySoFarInput {
  records: readonly ChapterRecord[];
  eras: readonly EraLine[];
  canon: string;
  chapterTitle: string | null;
  threads: readonly ArcEntry[];
  settings: ChapterSettings;
}

export function storySoFarText(input: StorySoFarInput): string {
  const { settings } = input;
  const parts: string[] = [];
  if (input.records.length) parts.push(`[The story so far]\n${renderChronicle(input.records, input.eras, settings.chronicleTokens).text}`);
  const chapter = clip(chapterCanonText(input.canon), settings.chapterTokens);
  if (chapter) parts.push(`[This chapter${input.chapterTitle ? `: ${input.chapterTitle}` : ""}]\n${chapter}`);
  const titles = new Map(input.records.map((record) => [record.id, record.playerTitle]));
  const lines: string[] = [];
  let used = 0;
  for (const arc of [...input.threads.filter((thread) => thread.pinned), ...input.threads.filter((thread) => !thread.pinned).reverse()].slice(0, 8)) {
    const origin = arc.originChapter ? titles.get(arc.originChapter) : undefined;
    const line = `- ${arc.text}${origin ? ` (since ${origin})` : ""}`;
    if (used + estimateTokens(line) > settings.threadTokens) break;
    lines.push(line);
    used += estimateTokens(line);
  }
  if (lines.length) parts.push(`[Open threads]\n${lines.join("\n")}`);
  return parts.join("\n\n");
}

export function bridgeText(record: ChapterRecord, next: string | null): string {
  return `The chapter ${record.playerTitle} has ended: ${record.short}${next ? ` A new chapter begins: ${next}.` : ""}`;
}

export interface FoldRow {
  extra?: unknown;
  [key: string]: unknown;
}

export interface FoldOutcome {
  folded: number;
  kept: number;
  missing: number;
}

export function foldRange(records: readonly ChapterRecord[], story: NormalizedStoryV2 | null, foldEras = false): Array<{ from: number; to: number }> {
  return records.filter((record) => (isEraId(story, record.chapterId) ? foldEras : story?.chapterById?.[record.chapterId]?.seal?.fold_messages !== false)).map((record) => {
    const tail = story?.chapterById?.[record.chapterId]?.seal?.keep_tail ?? 6;
    return { from: record.range.from, to: record.range.to - tail };
  }).filter((range) => range.to >= range.from);
}

export function foldRows(rows: FoldRow[], idOf: (row: FoldRow) => number | null, ranges: ReadonlyArray<{ from: number; to: number }>): FoldOutcome {
  const outcome: FoldOutcome = { folded: 0, kept: 0, missing: 0 };
  rows.forEach((row, index) => {
    const id = idOf(row);
    if (id === null) {
      outcome.missing += 1;
      return;
    }
    if (!ranges.some((range) => id >= range.from && id <= range.to)) {
      outcome.kept += 1;
      return;
    }
    const extra = typeof row.extra === "object" && row.extra !== null ? row.extra : {};
    rows[index] = { ...row, extra: { ...extra, [IGNORE]: true } };
    outcome.folded += 1;
  });
  return outcome;
}

export interface Dossier {
  rosterId: string;
  name: string;
  text: string;
  recordId: string;
  playerTitle: string;
  history: Array<{ recordId: string; text: string }>;
}

export function dossiers(records: readonly ChapterRecord[]): Map<string, Dossier> {
  const out = new Map<string, Dossier>();
  records.forEach((record) => record.people.forEach((person) => {
    const previous = out.get(person.rosterId);
    const history = previous ? [...previous.history, { recordId: previous.recordId, text: previous.text }].slice(-4) : [];
    out.set(person.rosterId, { rosterId: person.rosterId, name: person.name, text: person.text, recordId: record.id, playerTitle: record.playerTitle, history });
  }));
  return out;
}

const enabledBy = (story: NormalizedStoryV2, checkpointId: string): string[] => {
  const changes = story.checkpointById[checkpointId]?.effects?.cast_changes as { enable?: unknown } | undefined;
  const enable = changes?.enable;
  return (Array.isArray(enable) ? enable : typeof enable === "string" ? [enable] : []).filter((name): name is string => typeof name === "string").map((name) => name.trim().toLowerCase());
};

export function returningLines(story: NormalizedStoryV2 | null, records: readonly ChapterRecord[], visitedPath: readonly string[], lastMessageId: number, window: number): Map<string, string> {
  const out = new Map<string, string>();
  const last = records[records.length - 1];
  if (!story || !last || lastMessageId - last.range.to > window) return out;
  const since = visitedPath.slice(Math.max(0, last.sealedAt.pathLength - 1));
  const enabled = new Set(since.flatMap((id) => enabledBy(story, id)));
  dossiers(records).forEach((dossier) => {
    if (dossier.recordId === last.id) return;
    const member = story.roster.find((entry) => entry.id === dossier.rosterId);
    const names = [dossier.rosterId, member?.name ?? "", dossier.name].map((name) => name.trim().toLowerCase()).filter(Boolean);
    if (names.some((name) => enabled.has(name))) out.set(dossier.rosterId, `Returning: ${dossier.name} — last seen in ${dossier.playerTitle}: ${dossier.text}`);
  });
  return out;
}

export function chapterListText(story: NormalizedStoryV2 | null, records: readonly ChapterRecord[], activeCheckpointId: string | undefined): string {
  if (!records.length) return "No chapter has ended yet.";
  const current = chapterOf(story, activeCheckpointId);
  const lines = records.map((record) => `${chapterNumber(story, record.chapterId)}. ${record.playerTitle} — ${record.short}`);
  if (current && !records.some((record) => record.final)) lines.push(`Now: ${current.kind === "interlude" ? "" : `${chapterNumber(story, current.id)}. `}${playerTitleOf(current)}`);
  return lines.join("\n");
}

export const recordsForChapter = (story: NormalizedStoryV2 | null, records: readonly ChapterRecord[], number: number): ChapterRecord[] =>
  records.filter((record) => chapterNumber(story, record.chapterId) === number);
