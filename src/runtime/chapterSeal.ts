import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { maxTokensForInput } from "@extraction/callBudget";
import { lapseAsEmpty } from "@extraction/modelError";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import { estimateTokens } from "@memory/budget";
import { assembleChapterInput, type ChapterInput } from "@memory/chapterInput";
import { foldChapter } from "@memory/chapterFold";
import {
  buildChapterRecordPrompt, buildSagaPrompt, degradedChapterRecord, parseChapterRecord, verifyChapterRecord, verifySaga, type ParsedChapterRecord,
} from "@memory/chapterRecord";
import { unfoldChapters } from "@memory/chapterUnfold";
import { buildEraMergePrompt, CHRONICLE_RECORD_CAP, eraCandidates, fallbackEraText, parseEraLine, renderChronicle } from "@memory/chronicle";
import type { DerivedRecord } from "@memory/derived";
import { provenance, withOverride } from "@memory/provenance";
import { generateMemoryId, type ArcEntry, type ChapterDisposition, type ChapterRecord } from "@memory/types";
import { bridgeText } from "./chapterKit";
import { chapterNumber, chapterOf, chapterSettings, endsStory, nextPart, playerTitleOf, sealRange, type SealTarget } from "./chapters";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import type { MemoryRuntimeState } from "./types";
import type { ChapterHost } from "./chapterPort";
import { rosterMemberName } from "./roster";

export const CHAPTER_INPUT_TOKENS = 6000;
const QUIET_KEYS = new Set(["tension"]);

export interface ChapterSealDeps {
  getStory: () => NormalizedStoryV2 | null;
  getState: () => EngineState | null;
  memory: () => MemoryRuntimeState;
  patch: (next: Partial<MemoryRuntimeState>) => void;
  record: (input: Omit<DerivedRecord, "id" | "boundary" | "messageId"> & { messageId?: number }) => void;
  model: () => ModelCall;
  ownership: () => RunOwnership;
  closeScene: (to: number) => Promise<void>;
  sceneStart: (to: number) => number;
  summarizeArcs: (ids: string[]) => Promise<boolean>;
  updateInjection: () => void;
  save: () => Promise<void>;
  roster: () => Array<{ id: string; name: string }>;
  playerName: () => string;
  journal: (summary: string, detail?: string) => void;
  announce: (text: string) => Promise<void>;
}

export const sealDeps = (host: ChapterHost): ChapterSealDeps => {
  const { coordinator, deps } = host;
  return {
    getStory: () => deps.getStory(), getState: () => deps.getState(), memory: host.memory, patch: host.patch, record: host.record,
    model: () => deps.model, ownership: () => deps.ownership, save: host.save,
    closeScene: (to) => deps.chapterHost?.closeScene(to) ?? Promise.resolve(), sceneStart: (to) => coordinator.sceneStart(to),
    summarizeArcs: (ids) => coordinator.runArcSummaryPass(ids), updateInjection: () => coordinator.updateInjection(),
    roster: () => (deps.getStory()?.roster ?? []).map((member) => ({ id: member.id, name: rosterMemberName(member) })),
    playerName: () => deps.chapterHost?.playerName() ?? "", journal: (summary, detail) => deps.chapterHost?.journal(summary, detail),
    announce: (text) => deps.chapterHost?.announce(text) ?? Promise.resolve(),
  };
};

export interface SealAt {
  boundary: number;
  messageId: number;
  pathLength?: number;
}

const inRange = (messageId: number | undefined, range: { from: number; to: number }) => typeof messageId === "number" && messageId >= range.from && messageId <= range.to;

const fitInput = (input: ChapterInput, render: (input: ChapterInput) => string): ChapterInput => {
  let items = [...input.items];
  for (const kind of ["detail", "fact", "ledger"] as const) {
    while (estimateTokens(render({ ...input, items })) > CHAPTER_INPUT_TOKENS && items.some((item) => item.kind === kind)) {
      const drop = items.findIndex((candidate) => candidate.kind === kind);
      items = items.filter((_item, index) => index !== drop);
    }
  }
  return { ...input, items };
};

// The seal pass as one delegated unit (the canonSynthesis pattern). Everything it
// writes is checked against the run it started, and nothing it writes deletes a row: folding marks
// `foldedInto`, and the `chapter_seal` derived record is what a rollback undoes.
export class ChapterSeal {
  private inFlight = false;

  constructor(private readonly deps: ChapterSealDeps) {}

  async seal(target: SealTarget, at: SealAt): Promise<ChapterRecord | null> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    if (!story || !state || this.inFlight) return null;
    const existing = this.deps.memory().chapters ?? [];
    if (existing.some((record) => record.chapterId === target.chapter.id && record.part === target.part)) return null;
    this.inFlight = true;
    try {
      return await this.run(story, state, target, at);
    } finally {
      this.inFlight = false;
    }
  }

  private async run(story: NormalizedStoryV2, state: EngineState, target: SealTarget, at: SealAt): Promise<ChapterRecord | null> {
    const records = this.deps.memory().chapters ?? [];
    const range = sealRange(records, this.deps.memory().storyStart, at.messageId);
    const run = beginRun(this.deps.ownership(), range);
    if (this.deps.sceneStart(range.to) <= range.to) await this.deps.closeScene(range.to);
    if (!run.stillOwns()) return null;
    const unsummarized = this.deps.memory().arcs
      .filter((arc) => arc.status === "resolved" && !arc.summary && !arc.foldedInto && inRange(arc.resolvedMessageId, range)).map((arc) => arc.id);
    if (unsummarized.length) await this.deps.summarizeArcs(unsummarized);
    if (!run.stillOwns()) return null;
    const previous = records[records.length - 1] ?? null;
    const pathLength = at.pathLength ?? state.visitedPath.length;
    const visited = state.visitedPath.slice(previous?.sealedAt.pathLength ? previous.sealedAt.pathLength - 1 : 0, target.final ? pathLength : Math.max(0, pathLength - 1));
    const blackboardAt = Object.fromEntries(Object.entries(state.blackboard.values).filter(([key]) => !QUIET_KEYS.has(key)));
    const memory = this.deps.memory();
    const raw = assembleChapterInput({
      range, entries: memory.entries, arcs: memory.arcs, ledger: memory.ledger,
      blackboardBefore: previous?.blackboardAt ?? story.checkpointById[story.startCheckpointId]?.state_snapshot ?? {}, blackboardAfter: blackboardAt,
      places: [...new Set(visited.map((id) => story.checkpointById[id]?.player_name).filter((name): name is string => Boolean(name)))],
      roster: this.deps.roster(), previous,
    });
    const style = target.chapter.seal?.record_style ?? "prose";
    const input = fitInput(raw, (candidate) => buildChapterRecordPrompt(story.title, playerTitleOf(target.chapter), candidate, style));
    const titles = (story.chapters ?? []).flatMap((chapter) => [chapter.title, chapter.player_title ?? ""]);
    const known = [story.title, this.deps.playerName(), ...titles, ...story.checkpoints.map((checkpoint) => checkpoint.player_name ?? "")];
    const written = await this.write(story, target, input, style, known, run);
    if (!written) return null;
    const sealedRecord = this.buildRecord(story, target, at, range, visited, pathLength, written, input, blackboardAt);
    const epilogue = target.final ? await this.saga(story, [...records, sealedRecord], blackboardAt, run) : null;
    if (!run.stillOwns()) return null;
    const record = epilogue ? { ...sealedRecord, epilogue } : sealedRecord;
    this.commitSeal(story, record, target, written.record.open);
    await this.mergeEras(run);
    if (!run.stillOwns()) return null;
    this.deps.updateInjection();
    await this.deps.save();
    if (!run.stillOwns()) return record;
    this.deps.journal(`chapter sealed: ${record.playerTitle}${record.status === "degraded" ? " (without a written summary)" : ""}`, `${record.id} · messages ${range.from}-${range.to}`);
    const entered = chapterOf(story, state.activeCheckpointId);
    if (!record.final && entered && entered.kind !== "interlude") await this.deps.announce(`◆ Chapter ${chapterNumber(story, entered.id)} — ${playerTitleOf(entered)}`);
    return record;
  }

  private ask(prompt: string, run: RunGuard, maxTokens = maxTokensForInput("chapterSeal", prompt)): Promise<string> {
    return askText(this.deps.model(), prompt, { role: "synthesis", pass: "chapterSeal", maxTokens, signal: run.signal, refuseIncomplete: true }).catch(lapseAsEmpty);
  }

  private async write(story: NormalizedStoryV2, target: SealTarget, input: ChapterInput, style: "prose" | "chronicle", known: string[], run: RunGuard) {
    let failures: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prompt = buildChapterRecordPrompt(story.title, playerTitleOf(target.chapter), input, style, failures);
      const text = await this.ask(prompt, run);
      if (!run.stillOwns()) return null;
      const parsed = parseChapterRecord(stripChannelNoise(text), input);
      failures = parsed.ok ? verifyChapterRecord(parsed.record, input, known) : [parsed.reason];
      if (parsed.ok && !failures.length) return { record: parsed.record, status: "sealed" as const, failures };
    }
    return { record: degradedChapterRecord(input), status: "degraded" as const, failures };
  }

  private buildRecord(_story: NormalizedStoryV2, target: SealTarget, at: SealAt, range: { from: number; to: number }, visited: string[], pathLength: number,
    written: { record: ParsedChapterRecord; status: "sealed" | "degraded" }, input: ChapterInput, blackboardAt: Record<string, unknown>): ChapterRecord {
    const records = this.deps.memory().chapters ?? [];
    const previous = records[records.length - 1];
    return {
      id: `${target.chapter.id}#${target.part}`,
      chapterId: target.chapter.id,
      part: target.part,
      title: target.chapter.title,
      playerTitle: playerTitleOf(target.chapter),
      range,
      boundaries: { from: previous ? previous.boundaries.to + 1 : 0, to: at.boundary },
      checkpoints: visited,
      summary: written.record.summary,
      short: written.record.short,
      consequences: written.record.consequences,
      people: written.record.people,
      open: written.record.open,
      blackboardDelta: input.blackboardDelta,
      blackboardAt,
      status: written.status,
      provenance: provenance({ source: "code", messageId: at.messageId, boundary: at.boundary, pass: "chapterSeal", inputs: input.items.map((item) => ({ store: "memory" as const, id: item.id })) }),
      tokens: { summary: estimateTokens(written.record.summary), short: estimateTokens(written.record.short) },
      sealedAt: { boundary: at.boundary, messageId: at.messageId, at: Date.now(), pathLength },
      ...(target.final ? { final: true } : {}),
    };
  }

  private commitSeal(story: NormalizedStoryV2, record: ChapterRecord, target: SealTarget, decided: ChapterRecord["open"]) {
    const memory = this.deps.memory();
    const policy = target.chapter.seal?.open_threads ?? "decide";
    const disposition = (arc: ArcEntry): ChapterDisposition => {
      if (policy === "carry" || record.status === "degraded") return "carry";
      if (policy === "close") return "closed-offscreen";
      return decided.find((item) => item.arcId === arc.id)?.disposition ?? "carry";
    };
    const folded = foldChapter({ entries: memory.entries, arcs: memory.arcs, shortTermSummaryEnd: memory.shortTermSummaryEnd }, record, disposition);
    const next = chapterOf(story, this.deps.getState()?.activeCheckpointId);
    this.deps.patch({
      entries: folded.entries,
      arcs: folded.arcs,
      shortTermSummaryEnd: folded.shortTermSummaryEnd,
      chapters: [...(memory.chapters ?? []), record].slice(-CHRONICLE_RECORD_CAP),
      chapterBridge: record.final ? null : { recordId: record.id, text: bridgeText(record, next ? playerTitleOf(next) : null) },
    });
    const moved = folded.shortTermSummaryEnd > memory.shortTermSummaryEnd;
    const range = moved ? { range: { from: memory.shortTermSummaryEnd + 1, to: folded.shortTermSummaryEnd } } : {};
    this.deps.record({ kind: "chapter_seal", inputs: [...folded.folded, ...folded.resolved], outputId: record.id, messageId: record.sealedAt.messageId, ...range });
  }

  private async saga(story: NormalizedStoryV2, records: ChapterRecord[], outcome: Record<string, unknown>, run: RunGuard): Promise<string | null> {
    const cast = [...this.deps.roster().map((member) => member.name), this.deps.playerName(), story.title];
    let text = "";
    for (let attempt = 0; attempt < 2 && !text; attempt += 1) {
      const prompt = buildSagaPrompt(story.title, records, outcome);
      const reply = stripChannelNoise(await this.ask(prompt, run));
      if (!run.stillOwns()) return null;
      if (reply && !verifySaga(reply, records, cast).length) text = reply;
    }
    return text || records.map((record) => record.summary).join("\n\n");
  }

  private async mergeEras(run: RunGuard) {
    const settings = chapterSettings(this.deps.memory().settings.chapters);
    for (let pass = 0; pass < 4; pass += 1) {
      const memory = this.deps.memory();
      const records = memory.chapters ?? [];
      const eras = memory.chronicle?.eras ?? [];
      if (renderChronicle(records, eras, settings.chronicleTokens).fits) return;
      const merge = eraCandidates(records, eras);
      if (merge.length < 2) return;
      const reply = await this.ask(buildEraMergePrompt(merge), run, 256);
      if (!run.stillOwns()) return;
      const text = parseEraLine(stripChannelNoise(reply)) ?? fallbackEraText(merge);
      const era = { id: generateMemoryId(), recordIds: merge.map((record) => record.id), text, messageId: this.deps.getState()?.lastMessageId ?? -1 };
      const current = this.deps.memory();
      this.deps.patch({ chronicle: { eras: [...(current.chronicle?.eras ?? []), era] } });
      this.deps.record({ kind: "era_merge", inputs: era.recordIds, outputId: era.id, messageId: era.messageId });
    }
  }

  async sealNow(): Promise<ChapterRecord | null> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const chapter = chapterOf(story, state?.activeCheckpointId);
    if (!story || !state || !chapter) return null;
    const records = this.deps.memory().chapters ?? [];
    const target = { chapter, part: nextPart(records, chapter.id), final: endsStory(story, state.activeCheckpointId) };
    return this.seal(target, { boundary: state.boundary, messageId: state.lastMessageId, pathLength: state.visitedPath.length + 1 });
  }

  async unseal(recordId: string): Promise<boolean> {
    const memory = this.deps.memory();
    const records = memory.chapters ?? [];
    if (records[records.length - 1]?.id !== recordId) return false;
    const run = beginRun(this.deps.ownership());
    const unfolded = unfoldChapters({ entries: memory.entries, arcs: memory.arcs, chapters: records, chronicle: memory.chronicle ?? { eras: [] } }, new Set([recordId]));
    const derived = memory.derived.filter((record) => record.outputId !== recordId && !(record.kind === "era_merge" && record.inputs.includes(recordId)));
    this.deps.patch({ ...unfolded, derived, ...(memory.chapterBridge?.recordId === recordId ? { chapterBridge: null } : {}) });
    this.deps.updateInjection();
    await this.deps.save();
    if (run.stillOwns()) this.deps.journal(`chapter unsealed: ${records[records.length - 1].playerTitle}`, recordId);
    return true;
  }

  async reseal(recordId: string): Promise<ChapterRecord | null> {
    const story = this.deps.getStory();
    const record = (this.deps.memory().chapters ?? []).find((candidate) => candidate.id === recordId);
    const chapter = story?.chapterById?.[record?.chapterId ?? ""];
    if (!record || !chapter || !(await this.unseal(recordId))) return null;
    return this.seal({ chapter, part: record.part, final: Boolean(record.final) }, record.sealedAt);
  }

  async editSummary(recordId: string, summary: string, short?: string): Promise<boolean> {
    const memory = this.deps.memory();
    const record = (memory.chapters ?? []).find((candidate) => candidate.id === recordId);
    const text = summary.trim();
    if (!record || !text) return false;
    const state = this.deps.getState();
    const run = beginRun(this.deps.ownership());
    const edited: ChapterRecord = {
      ...record, summary: text, ...(short?.trim() ? { short: short.trim() } : {}), status: "author-edited",
      ...withOverride(record, "edit", new Date().toISOString(), state?.boundary ?? 0),
      tokens: { summary: estimateTokens(text), short: estimateTokens(short?.trim() || record.short) },
    };
    this.deps.patch({ chapters: (memory.chapters ?? []).map((candidate) => (candidate.id === recordId ? edited : candidate)) });
    this.deps.updateInjection();
    await this.deps.save();
    if (run.stillOwns()) this.deps.journal(`chapter summary edited: ${record.playerTitle}`, recordId);
    return true;
  }
}
