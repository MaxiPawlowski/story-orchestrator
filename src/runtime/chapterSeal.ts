import type { EngineState, NormalizedStoryV2 } from "@engine/index";
import { maxTokensForInput } from "@extraction/callBudget";
import { lapseAsEmpty } from "@extraction/modelError";
import { askText, type ModelCall } from "@extraction/modelRoute";
import { stripChannelNoise } from "@extraction/parse";
import { buildVerifyRequest, readVerify, verifyVerdict, VERIFY_TIMEOUT_MS } from "@judge/index";
import { estimateTokens } from "@memory/budget";
import { assembleChapterInput, type ChapterInput } from "@memory/chapterInput";
import { foldChapter, foldEpistemic, leavingCast } from "@memory/chapterFold";
import {
  buildChapterRecordPrompt, buildSagaPrompt, degradedChapterRecord, parseChapterRecord, verifyChapterRecord, verifySaga, type ParsedChapterRecord,
} from "@memory/chapterRecord";
import {
  buildChapterMapPrompt, chunkChapterItems, clipChapterInput, expandChapterSources, parseChapterDigest, reduceChapterInput, type ChapterDigest, type ReducedChapterInput,
} from "@memory/chapterReduce";
import { unfoldChapters } from "@memory/chapterUnfold";
import { chapterAnnouncementText } from "./narrative";
import { buildEraMergePrompt, CHRONICLE_RECORD_CAP, eraCandidates, eraMessageId, fallbackEraText, parseEraLine, renderChronicle } from "@memory/chronicle";
import type { DerivedRecord } from "@memory/derived";
import { provenance, withOverride } from "@memory/provenance";
import { generateMemoryId, type ArcEntry, type ChapterDisposition, type ChapterRecord } from "@memory/types";
import { bridgeText } from "./chapterKit";
import { chapterNumber, chapterOf, chapterSettings, endsStory, eraChapter, isEraId, nextPart, playerTitleOf, sealRange, type SealTarget } from "./chapters";
import type { JudgeRuntime } from "./judge";
import { beginRun, type RunGuard, type RunOwnership } from "./runToken";
import type { MemoryRuntimeState } from "./types";
import { sealAtState, type ChapterHost, type SealAt } from "./chapterPort";
import { rosterMemberName } from "./roster";

export type { SealAt };

export const CHAPTER_INPUT_TOKENS = 6000;
export const SEAL_CALL_BUDGET = 6;
export const WRITE_ATTEMPTS = 2;
export const MAP_MAX_TOKENS = 768;
export const JUDGED_CONSEQUENCES = 12;
const QUIET_KEYS = new Set(["tension"]);

export type SealJudge = Pick<JudgeRuntime, "active" | "ask">;

interface SealRun {
  guard: RunGuard;
  calls: number;
}

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
  judge?: () => SealJudge | null;
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
    announce: (text) => deps.chapterHost?.announce(text) ?? Promise.resolve(), judge: () => deps.judge?.() ?? null,
  };
};

const inRange = (messageId: number | undefined, range: { from: number; to: number }) => typeof messageId === "number" && messageId >= range.from && messageId <= range.to;

const castDisabled = (story: NormalizedStoryV2, checkpointId: string): unknown => {
  const changes = story.checkpointById[checkpointId]?.effects?.cast_changes;
  return changes && typeof changes === "object" ? (changes as { disable?: unknown }).disable : undefined;
};

export function unsealedView(memory: MemoryRuntimeState, recordId: string): Partial<MemoryRuntimeState> {
  const stores = { entries: memory.entries, arcs: memory.arcs, chapters: memory.chapters ?? [], chronicle: memory.chronicle ?? { eras: [] }, epistemic: memory.epistemic };
  const unfolded = unfoldChapters(stores, new Set([recordId]));
  const seal = memory.derived.find((record) => record.kind === "chapter_seal" && record.outputId === recordId);
  return {
    ...unfolded,
    derived: memory.derived.filter((record) => record.outputId !== recordId && !(record.kind === "era_merge" && record.inputs.includes(recordId))),
    shortTermSummaryEnd: seal?.range ? Math.min(memory.shortTermSummaryEnd, seal.range.from - 1) : memory.shortTermSummaryEnd,
  };
}

// The seal pass as one delegated unit (the canonSynthesis pattern). Everything it
// writes is checked against the run it started, and nothing it writes deletes a row: folding marks
// `foldedInto`, and the `chapter_seal` derived record is what a rollback undoes.
export class ChapterSeal {
  private inFlight = false;

  constructor(private readonly deps: ChapterSealDeps) {}

  async seal(target: SealTarget, at: SealAt): Promise<ChapterRecord | null> {
    const story = this.deps.getStory();
    if (!story || this.inFlight) return null;
    const existing = this.deps.memory().chapters ?? [];
    if (existing.some((record) => record.chapterId === target.chapter.id && record.part === target.part)) return null;
    this.inFlight = true;
    try {
      return await this.run(story, target, at);
    } finally {
      this.inFlight = false;
    }
  }

  private async run(story: NormalizedStoryV2, target: SealTarget, at: SealAt): Promise<ChapterRecord | null> {
    const records = this.deps.memory().chapters ?? [];
    const range = sealRange(records, this.deps.memory().storyStart, at.messageId);
    const guard = beginRun(this.deps.ownership(), range);
    const run: SealRun = { guard, calls: 0 };
    if (this.deps.sceneStart(range.to) <= range.to) await this.deps.closeScene(range.to);
    if (!guard.stillOwns()) return null;
    const unsummarized = this.deps.memory().arcs
      .filter((arc) => arc.status === "resolved" && !arc.summary && !arc.foldedInto && inRange(arc.resolvedMessageId, range)).map((arc) => arc.id);
    if (unsummarized.length) await this.deps.summarizeArcs(unsummarized);
    if (!guard.stillOwns()) return null;
    const previous = records[records.length - 1] ?? null;
    const pathLength = at.pathLength;
    const visited = at.path.slice(previous?.sealedAt.pathLength ? previous.sealedAt.pathLength - 1 : 0, target.final ? pathLength : Math.max(0, pathLength - 1));
    const blackboardAt = Object.fromEntries(Object.entries(at.blackboard).filter(([key]) => !QUIET_KEYS.has(key)));
    const memory = this.deps.memory();
    const raw = assembleChapterInput({
      range, entries: memory.entries, arcs: memory.arcs, ledger: memory.ledger,
      blackboardBefore: previous?.blackboardAt ?? story.checkpointById[story.startCheckpointId]?.state_snapshot ?? {}, blackboardAfter: blackboardAt,
      places: [...new Set(visited.map((id) => story.checkpointById[id]?.player_name).filter((name): name is string => Boolean(name)))],
      roster: this.deps.roster(), previous,
    });
    const style = target.chapter.seal?.record_style ?? "prose";
    const prepared = await this.prepare(story, target, raw, style, run);
    if (!prepared) return null;
    const titles = (story.chapters ?? []).flatMap((chapter) => [chapter.title, chapter.player_title ?? ""]);
    const known = [story.title, this.deps.playerName(), ...titles, ...story.checkpoints.map((checkpoint) => checkpoint.player_name ?? "")];
    const written = await this.write(story, target, prepared, raw, style, known, run);
    if (!written) return null;
    const sealedRecord = this.buildRecord(target, at, range, visited, written, raw, blackboardAt);
    const epilogue = target.final ? await this.saga(story, [...records, sealedRecord], blackboardAt, run) : null;
    if (!guard.stillOwns()) return null;
    const next = chapterOf(story, at.activeCheckpointId);
    const finished = epilogue ? { ...sealedRecord, epilogue } : sealedRecord;
    const era = isEraId(story, target.chapter.id);
    const record = finished.final || era ? finished : { ...finished, bridge: { text: bridgeText(finished, next ? playerTitleOf(next) : null) } };
    const roster = this.deps.roster();
    this.commitSeal(record, target, written.record.open, leavingCast(castDisabled(story, at.activeCheckpointId), roster), roster.flatMap((member) => [member.id, member.name]));
    await this.mergeEras(run);
    if (!guard.stillOwns()) return null;
    this.deps.updateInjection();
    await this.deps.save();
    if (!guard.stillOwns()) return record;
    this.deps.journal(`chapter sealed: ${record.playerTitle}${record.status === "degraded" ? " (without a written summary)" : ""}`, `${record.id} · messages ${range.from}-${range.to}`);
    const entered = chapterOf(story, at.activeCheckpointId);
    if (!record.final && entered && entered.kind !== "interlude") await this.deps.announce(chapterAnnouncementText(chapterNumber(story, entered.id), playerTitleOf(entered)));
    return record;
  }

  private ask(prompt: string, run: SealRun, maxTokens = maxTokensForInput("chapterSeal", prompt)): Promise<string> {
    if (run.calls >= SEAL_CALL_BUDGET) return Promise.resolve("");
    run.calls += 1;
    return askText(this.deps.model(), prompt, { role: "synthesis", pass: "chapterSeal", maxTokens, signal: run.guard.signal, refuseIncomplete: true }).catch(lapseAsEmpty);
  }

  private async prepare(story: NormalizedStoryV2, target: SealTarget, raw: ChapterInput, style: "prose" | "chronicle", run: SealRun): Promise<ReducedChapterInput | null> {
    const title = playerTitleOf(target.chapter);
    const fits = (candidate: ChapterInput) => estimateTokens(buildChapterRecordPrompt(story.title, title, candidate, style)) <= CHAPTER_INPUT_TOKENS;
    if (fits(raw)) return { input: raw, sources: new Map() };
    const mapCalls = SEAL_CALL_BUDGET - WRITE_ATTEMPTS - (target.final ? 1 : 0);
    const chunks = chunkChapterItems(raw.items, (chunk) => estimateTokens(buildChapterMapPrompt(story.title, title, chunk, 1, 1)) <= CHAPTER_INPUT_TOKENS, mapCalls);
    const digests: ChapterDigest[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const reply = await this.ask(buildChapterMapPrompt(story.title, title, chunk, index + 1, chunks.length), run, MAP_MAX_TOKENS);
      if (!run.guard.stillOwns()) return null;
      digests.push(parseChapterDigest(stripChannelNoise(reply), chunk, index + 1));
    }
    const reduced = reduceChapterInput(raw, digests);
    return { input: clipChapterInput(reduced.input, fits), sources: reduced.sources };
  }

  private async write(story: NormalizedStoryV2, target: SealTarget, prepared: ReducedChapterInput, raw: ChapterInput, style: "prose" | "chronicle", known: string[], run: SealRun) {
    const { input } = prepared;
    let failures: string[] = [];
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
      const prompt = buildChapterRecordPrompt(story.title, playerTitleOf(target.chapter), input, style, failures);
      const text = await this.ask(prompt, run);
      if (!run.guard.stillOwns()) return null;
      const parsed = parseChapterRecord(stripChannelNoise(text), input);
      failures = parsed.ok ? verifyChapterRecord(parsed.record, input, known) : [parsed.reason];
      if (!parsed.ok || failures.length) continue;
      const judged = await this.judgeConsequences(story, parsed.record, input, run);
      if (judged === null) return null;
      failures = judged;
      if (!failures.length) return { record: expandChapterSources(parsed.record, prepared.sources), status: "sealed" as const, failures };
    }
    return { record: degradedChapterRecord(raw), status: "degraded" as const, failures };
  }

  private async judgeConsequences(story: NormalizedStoryV2, record: ParsedChapterRecord, input: ChapterInput, run: SealRun): Promise<string[] | null> {
    const judge = this.deps.judge?.() ?? null;
    if (!judge?.active("memoryVerify") || !record.consequences.length) return [];
    const sources = new Map<string, { id: string; speaker: string; text: string }>([
      ...input.items.map((item): [string, { id: string; speaker: string; text: string }] => [item.id, { id: item.id, speaker: item.kind, text: item.text }]),
      ...input.openArcs.map((arc): [string, { id: string; speaker: string; text: string }] => [arc.id, { id: arc.id, speaker: "thread", text: arc.text }]),
    ]);
    const cast = this.deps.roster().map((member) => member.name);
    const failures: string[] = [];
    for (const [index, item] of record.consequences.slice(0, JUDGED_CONSEQUENCES).entries()) {
      const transcript = item.sources.flatMap((id) => sources.get(id) ?? []);
      if (!transcript.length) continue;
      const result = await judge.ask("memoryVerify", buildVerifyRequest({ storyTitle: story.title, cast, transcript, lines: [item.text] }), {
        timeoutMs: VERIFY_TIMEOUT_MS,
        summarize: (answers) => ({ "line:0": readVerify(answers ?? {}, 1)[0] ?? "none" }),
      });
      if (!run.guard.stillOwns()) return null;
      const p = result.answers ? readVerify(result.answers, 1)[0] : null;
      if (verifyVerdict(p).action === "drop") failures.push(`consequence ${index + 1} is not supported by the inputs it cites`);
    }
    return failures;
  }

  private buildRecord(target: SealTarget, at: SealAt, range: { from: number; to: number }, visited: string[],
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
      sealedAt: { boundary: at.boundary, messageId: at.messageId, at: Date.now(), pathLength: at.pathLength },
      ...(target.final ? { final: true } : {}),
    };
  }

  private commitSeal(record: ChapterRecord, target: SealTarget, decided: ChapterRecord["open"], leaving: ReadonlySet<string>, cast: readonly string[]) {
    const memory = this.deps.memory();
    const policy = target.chapter.seal?.open_threads ?? "decide";
    const disposition = (arc: ArcEntry): ChapterDisposition => {
      if (policy === "carry" || record.status === "degraded") return "carry";
      if (policy === "close") return "closed-offscreen";
      return decided.find((item) => item.arcId === arc.id)?.disposition ?? "carry";
    };
    const folded = foldChapter({ entries: memory.entries, arcs: memory.arcs, shortTermSummaryEnd: memory.shortTermSummaryEnd }, record, disposition);
    const knowledge = foldEpistemic(memory.epistemic, record.id, leaving, cast);
    this.deps.patch({
      entries: folded.entries,
      arcs: folded.arcs,
      epistemic: knowledge.epistemic,
      shortTermSummaryEnd: folded.shortTermSummaryEnd,
      derived: memory.derived,
      chronicle: memory.chronicle ?? { eras: [] },
      chapters: [...(memory.chapters ?? []), record].slice(-CHRONICLE_RECORD_CAP),
    });
    const moved = folded.shortTermSummaryEnd > memory.shortTermSummaryEnd;
    const range = moved ? { range: { from: memory.shortTermSummaryEnd + 1, to: folded.shortTermSummaryEnd } } : {};
    this.deps.record({ kind: "chapter_seal", inputs: [...folded.folded, ...folded.resolved, ...knowledge.folded], outputId: record.id, messageId: record.sealedAt.messageId, ...range });
  }

  private async saga(story: NormalizedStoryV2, records: ChapterRecord[], outcome: Record<string, unknown>, run: SealRun): Promise<string | null> {
    const cast = [...this.deps.roster().map((member) => member.name), this.deps.playerName(), story.title];
    let text = "";
    for (let attempt = 0; attempt < 2 && !text; attempt += 1) {
      const prompt = buildSagaPrompt(story.title, records, outcome);
      const reply = stripChannelNoise(await this.ask(prompt, run));
      if (!run.guard.stillOwns()) return null;
      if (reply && !verifySaga(reply, records, cast).length) text = reply;
    }
    return text || records.map((record) => record.summary).join("\n\n");
  }

  private async mergeEras(run: SealRun) {
    const settings = chapterSettings(this.deps.memory().settings.chapters);
    for (let pass = 0; pass < 4; pass += 1) {
      const memory = this.deps.memory();
      const records = memory.chapters ?? [];
      const eras = memory.chronicle?.eras ?? [];
      if (renderChronicle(records, eras, settings.chronicleTokens).fits) return;
      const merge = eraCandidates(records, eras);
      if (merge.length < 2) return;
      const reply = await this.ask(buildEraMergePrompt(merge), run, 256);
      if (!run.guard.stillOwns()) return;
      const text = parseEraLine(stripChannelNoise(reply)) ?? fallbackEraText(merge);
      const era = { id: generateMemoryId(), recordIds: merge.map((record) => record.id), text, messageId: eraMessageId(records) };
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
    return this.seal(target, sealAtState(state, { pathLength: state.visitedPath.length + 1 }));
  }

  async unseal(recordId: string): Promise<boolean> {
    const memory = this.deps.memory();
    const records = memory.chapters ?? [];
    if (records[records.length - 1]?.id !== recordId) return false;
    const run = beginRun(this.deps.ownership());
    this.deps.patch(unsealedView(memory, recordId));
    this.deps.updateInjection();
    await this.deps.save();
    if (run.stillOwns()) this.deps.journal(`chapter unsealed: ${records[records.length - 1].playerTitle}`, recordId);
    return true;
  }

  async reseal(recordId: string): Promise<ChapterRecord | null> {
    const story = this.deps.getStory();
    const state = this.deps.getState();
    const records = this.deps.memory().chapters ?? [];
    const record = records[records.length - 1];
    const declared = story?.chapterById?.[record?.chapterId ?? ""];
    const chapter = declared ?? (record && story && isEraId(story, record.chapterId)
      ? eraChapter(record.chapterId, record.title, record.playerTitle, chapterSettings(this.deps.memory().settings.chapters).foldEras) : undefined);
    if (!state || !record || record.id !== recordId || !chapter || this.inFlight) return null;
    const live = () => this.deps.memory();
    const view = new ChapterSeal({ ...this.deps, memory: () => ((live().chapters ?? []).includes(record) ? { ...live(), ...unsealedView(live(), recordId) } : live()) });
    const at = sealAtState(state, { boundary: record.sealedAt.boundary, messageId: record.sealedAt.messageId, pathLength: record.sealedAt.pathLength, blackboard: record.blackboardAt });
    this.inFlight = true;
    try {
      return await view.seal({ chapter, part: record.part, final: Boolean(record.final) }, at);
    } finally {
      this.inFlight = false;
    }
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
