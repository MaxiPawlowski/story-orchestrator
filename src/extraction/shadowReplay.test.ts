import * as fs from "node:fs";
import * as path from "node:path";
import { parseStoryOrThrow, StoryEngine, type PrimitiveValue } from "@engine/index";
import { windowOf } from "./chatRows";
import { runSharedRead, sharedReadWindow } from "./sharedRead";
import {
  arbitrationSample, classifyKey, compareCases, confidenceBand, J6D_MIN_KEYS, readSessionArchive, rebuildCase, rebuildSession, summarizeReplay,
  type ArchivedAudit, type ExtractorReply, type SessionFiles,
} from "./shadowReplay";
import type { ParsedFact, SharedReadAudit, TypedJudge } from "./types";

jest.mock("@services/STAPI", () => ({ getContext: () => ({ chat: [] }) }));

const ROOT = path.join(process.cwd(), "test/fixtures/j6d");
const SESSION = path.join(ROOT, "session-synthetic");
const storyRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "shadow-crossroads.story.json"), "utf8")) as Record<string, unknown>;
const story = parseStoryOrThrow(storyRaw);
const CHAT_ID = "j6d-synthetic";
const T0 = Date.parse("2026-10-14T08:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const NARRATION = [
  "The crossroads lie quiet under a clear sky.",
  "The smith eyes the party warily. The sky is clear.",
  "The smith relaxes a little and pours tea.",
  "Everyone agrees the north road it is.",
  "The smith hands over a folded map of the hills.",
  "The smith laughs and calls the party friends.",
  "Clouds gather but the sky stays clear.",
  "The smith offers a second cup.",
  "The road north looks muddy.",
  "The smith waves goodbye.",
  "A merchant passes by with a cart of apples.",
];

const JUDGED: Record<number, Array<{ q: string; v: PrimitiveValue }>> = {
  2: [{ q: "smith_trust", v: 1 }],
  3: [{ q: "gate_choice", v: "north" }],
  4: [{ q: "has_map", v: true }],
  5: [{ q: "smith_trust", v: 2 }],
};

const CONFIDENCE = (turn: number): Record<string, number> => ({ gate_choice: 0.88 + turn / 100, smith_trust: 0.81 + turn / 200, has_map: 0.96, coins_paid: 0.74 + turn / 50 });

const judgeFor = (turn: number): TypedJudge => async ({ qualities }) => {
  if (turn === 6) throw new Error("judge unreachable");
  const confidences = CONFIDENCE(turn);
  return {
    deltas: (JUDGED[turn] ?? []).map((entry) => ({ delta: { ...entry, source: "extractor" as const }, evidence: NARRATION[turn], judge: confidences[entry.q] })),
    answered: qualities.map((quality) => quality.key),
    model: "jev-synthetic",
    confidences,
  };
};

const residualReply = (turn: number) => (turn === 2 ? 'DELTA q=weather value="clear" evidence="The sky is clear."' : "NO_DELTA");

const journalAuditRow = (audit: SharedReadAudit) => ({
  at: audit.createdAt,
  kind: "audit",
  boundary: -1,
  messageId: audit.window.to,
  chatId: CHAT_ID,
  summary: `audit ${audit.reason} msgs ${audit.window.from}-${audit.window.to}`,
  detail: {
    reason: audit.reason, priority: audit.priority, window: audit.window, scope: audit.scope,
    accepted: audit.acceptedDeltas.map((item) => ({ q: item.delta.q, v: item.delta.v, evidence: item.evidence })),
    rejected: audit.rejected, judged: audit.judged ?? null, sceneBreak: audit.sceneBreak ?? null, prompt: audit.prompt, rawResponse: audit.rawResponse,
  },
});

const message = (id: number, row: { name: string; is_user: boolean; mes: string }) => ({ id, name: row.name, isUser: row.is_user, isSystem: false, text: row.mes, swipeId: null, swipes: [] });

const FACTS: ParsedFact[] = [{ text: "The smith owes the party a favour.", evidence: "The smith waves goodbye.", importance: 2 }];

const sec = (turn: number, offset: number) => T0 + turn * 60_000 + offset * 1000;

async function generateSession(): Promise<SessionFiles & { replies: Record<string, ExtractorReply[]> }> {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const chat: Array<{ name: string; is_user: boolean; mes: string }> = [{ name: "Narrator", is_user: false, mes: NARRATION[0] }];
  const journal: unknown[] = [];
  const transcripts: unknown[] = [];
  for (let turn = 1; turn < NARRATION.length; turn += 1) {
    chat.push({ name: "Wren", is_user: true, mes: `I ask the smith about the roads, turn ${turn}.` });
    chat.push({ name: "Narrator", is_user: false, mes: NARRATION[turn] });
    jest.setSystemTime(sec(turn, 0));
    const result = engine.commitBoundary({ lastMessageId: chat.length - 1, chatLength: chat.length });
    journal.push({ at: iso(sec(turn, 0)), kind: "boundary", boundary: result.boundary, messageId: chat.length - 1, summary: `boundary ${result.boundary}` });
    transcripts.push({ at: iso(sec(turn, 1)), verb: "turn", chatId: CHAT_ID, messages: chat.map((row, id) => message(id, row)) });
    if (turn < 2) continue;
    jest.setSystemTime(sec(turn, 10));
    const state = engine.serialize();
    const window = sharedReadWindow({ state, priority: 0, readWindow: (from, to) => windowOf(chat, from, to) });
    const { audit } = await runSharedRead({
      story, state, priority: 0, reason: "cadence", window, judgeTyped: judgeFor(turn),
      facts: turn === 10 ? FACTS : [],
      model: async () => ({ text: residualReply(turn), finish: "stop" }),
      ask: { role: "read", pass: "read" },
    });
    journal.push(journalAuditRow(audit));
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: audit.acceptedDeltas.map((entry) => entry.delta) });
  }
  const id = String(storyRaw.id);
  const runtime = { version: 7, chatId: CHAT_ID, selectedStoryId: id, stories: { [id]: { storyId: id, storyTitle: story.title, pinnedStory: storyRaw, contentHashAtLoad: "synthetic", engineState: engine.serialize(), engineHistory: engine.serializeHistory(), extras: {} } } };
  const files = { journal: journal.map((row) => JSON.stringify(row)).join("\n") + "\n", transcripts: transcripts.map((row) => JSON.stringify(row)).join("\n") + "\n", runtime, chatFull: chat.map((row, id) => ({ ...message(id, row), sendDate: null, swipeInfo: [], reasoning: null, extra: {} })) };
  return { ...files, replies: scriptedReplies(files) };
}

const quote = (text: string) => `evidence="${text}"`;

function scriptedReplies(files: SessionFiles): Record<string, ExtractorReply[]> {
  const session = readSessionArchive(files);
  const { cases } = rebuildSession(session, story);
  const replies: Record<string, ExtractorReply[]> = {};
  for (const replayCase of cases) {
    const turn = (replayCase.window.to) / 2;
    const run = (variant: number) => {
      const lines: string[] = [];
      for (const entry of JUDGED[turn] ?? []) {
        if (turn === 3 && variant === 0) continue;
        const value = turn === 5 ? 3 : entry.v;
        lines.push(`DELTA q=${entry.q} value=${JSON.stringify(value)} ${quote(NARRATION[turn])}`);
      }
      if (turn === 7 && variant === 1) lines.push(`DELTA q=has_map value=false ${quote(NARRATION[turn])}`);
      return { text: lines.length ? lines.join("\n") : "NO_DELTA", finish: "stop" as const };
    };
    replies[replayCase.id] = [run(0), run(1)];
  }
  return replies;
}

const readFixture = (): SessionFiles & { replies: Record<string, ExtractorReply[]> } => {
  const runtimeName = fs.readdirSync(SESSION).find((name) => /^runtime-.+\.json$/.test(name)) as string;
  const chatName = fs.readdirSync(SESSION).find((name) => /^chat-full-.+\.json$/.test(name)) as string;
  return {
    journal: fs.readFileSync(path.join(SESSION, "journal.jsonl"), "utf8"),
    transcripts: fs.readFileSync(path.join(SESSION, "transcripts.jsonl"), "utf8"),
    runtime: JSON.parse(fs.readFileSync(path.join(SESSION, runtimeName), "utf8")),
    chatFull: JSON.parse(fs.readFileSync(path.join(SESSION, chatName), "utf8")),
    replies: JSON.parse(fs.readFileSync(path.join(ROOT, "replies.json"), "utf8")),
  };
};

const writeFixture = (files: SessionFiles & { replies: Record<string, ExtractorReply[]> }) => {
  fs.mkdirSync(SESSION, { recursive: true });
  fs.writeFileSync(path.join(SESSION, "journal.jsonl"), files.journal);
  fs.writeFileSync(path.join(SESSION, "transcripts.jsonl"), files.transcripts ?? "");
  fs.writeFileSync(path.join(SESSION, `runtime-${CHAT_ID}.json`), `${JSON.stringify(files.runtime, null, 1)}\n`);
  fs.writeFileSync(path.join(SESSION, `chat-full-${CHAT_ID}.json`), `${JSON.stringify(files.chatFull, null, 1)}\n`);
  fs.writeFileSync(path.join(ROOT, "replies.json"), `${JSON.stringify(files.replies, null, 1)}\n`);
};

const GOLDEN = path.join(process.cwd(), "test/goldens/j6d/replay-summary.json");

describe("v2.8 12 J6d option C: offline reconstruction and replay", () => {
  let generated: Awaited<ReturnType<typeof generateSession>>;

  beforeAll(async () => {
    jest.useFakeTimers({ now: T0, doNotFake: ["nextTick", "setImmediate", "queueMicrotask", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    generated = await generateSession();
    jest.useRealTimers();
    if (process.env.SO_J6D_WRITE === "1") writeFixture(generated);
  });

  it("the committed synthetic session is what the production read writes today", () => {
    const fixture = readFixture();
    const lf = (text: string | undefined) => (text ?? "").replace(/\r\n/g, "\n");
    expect(lf(fixture.journal)).toBe(generated.journal);
    expect(lf(fixture.transcripts)).toBe(generated.transcripts);
    expect(fixture.runtime).toEqual(JSON.parse(JSON.stringify(generated.runtime)));
    expect(fixture.chatFull).toEqual(generated.chatFull);
    expect(fixture.replies).toEqual(generated.replies);
  });

  it("rebuilds every judged read whose residual prompt re-renders byte for byte, and refuses the rest with a reason", () => {
    const session = readSessionArchive(readFixture());
    const rebuilt = rebuildSession(session, parseStoryOrThrow(session.storyRaw));
    expect(rebuilt.cases).toHaveLength(7);
    expect(rebuilt.rebuiltKeys).toBe(28);
    expect(rebuilt.refusals.map((entry) => entry.code)).toEqual(["prompt-mismatch"]);
    expect(rebuilt.skipped).toEqual({ "not-judged": 0, "judge-failed": 1 });
    expect(rebuilt.refusals.find((entry) => entry.code === "prompt-mismatch")?.reason).toMatch(/section Canon-lite:/);
    for (const replayCase of rebuilt.cases) {
      const audit = session.audits.find((entry) => entry.at === replayCase.at) as ArchivedAudit;
      expect(replayCase.fullPrompt).not.toBe(audit.detail.prompt);
      for (const key of ["gate_choice", "smith_trust", "has_map", "coins_paid"]) {
        expect(audit.detail.prompt).not.toContain(`${key}:`);
        expect(replayCase.fullPrompt).toContain(key);
      }
    }
  });

  it("with memory facts in the context the canon re-renders and the refused read is rebuilt", () => {
    const session = readSessionArchive(readFixture());
    const rebuilt = rebuildSession(session, story, { memoryFacts: FACTS });
    expect(rebuilt.cases).toHaveLength(8);
    expect(rebuilt.refusals).toEqual([]);
  });

  it("an unchanged judge answer reads the reconstructed blackboard value; a moved one reads its delta", () => {
    const session = readSessionArchive(readFixture());
    const { cases } = rebuildSession(session, story);
    const at = (turn: number) => cases.find((entry) => entry.window.to === turn * 2)!;
    expect(at(5).answered.find((entry) => entry.key === "smith_trust")).toMatchObject({ before: 1, judge: { moved: true, value: 2 } });
    expect(at(7).answered.find((entry) => entry.key === "smith_trust")).toMatchObject({ before: 2, judge: { moved: false, value: 2 } });
    expect(at(7).answered.find((entry) => entry.key === "has_map")).toMatchObject({ before: true, judge: { moved: false, value: true } });
    expect(at(2).answered.find((entry) => entry.key === "gate_choice")).toMatchObject({ before: null, judge: { moved: false, value: null } });
    expect(at(7).stateBoundary).toBe(7);
  });

  it("refusal: a window no archived transcript covers", () => {
    const files = readFixture();
    const session = readSessionArchive({ ...files, transcripts: files.transcripts!.split("\n").slice(0, 3).join("\n"), chatFull: undefined });
    const late = session.audits.find((entry) => entry.detail.window.to === 14)!;
    const result = rebuildCase(late, { story, history: session.history, transcripts: session.transcripts, boundaries: session.boundaries });
    expect(result).toMatchObject({ ok: false, refusal: { code: "window-not-covered" } });
  });

  it("refusal: a prompt that does not re-render byte for byte", () => {
    const session = readSessionArchive(readFixture());
    const audit = session.audits.find((entry) => entry.detail.window.to === 8)!;
    const edited = { ...audit, detail: { ...audit.detail, prompt: audit.detail.prompt.replace("pours tea", "pours wine") } };
    const result = rebuildCase(edited, { story, history: session.history, transcripts: session.transcripts, boundaries: session.boundaries });
    expect(result).toMatchObject({ ok: false, refusal: { code: "prompt-mismatch" } });
    if (result.ok === false) expect(result.refusal.reason).toMatch(/section Transcript:/);
  });

  it("refusal: a missing boundary snapshot", () => {
    const session = readSessionArchive(readFixture());
    const audit = session.audits.find((entry) => entry.detail.window.to === 8)!;
    const history = { ...session.history, base: { ...session.history.base, lastMessageId: -1 }, log: session.history.log.filter((entry) => entry.after.lastMessageId < 8) };
    const result = rebuildCase(audit, { story, history, transcripts: session.transcripts, boundaries: session.boundaries });
    expect(result).toMatchObject({ ok: false, refusal: { code: "missing-snapshot" } });
  });

  it("refusal: a story that no longer holds an answered key", () => {
    const session = readSessionArchive(readFixture());
    const audit = session.audits.find((entry) => entry.detail.window.to === 8)!;
    const edited = parseStoryOrThrow({ ...storyRaw, qualities: (storyRaw.qualities as Array<Record<string, unknown>>).filter((quality) => quality.key !== "has_map"), transitions: [] });
    const result = rebuildCase(audit, { story: edited, history: session.history, transcripts: session.transcripts, boundaries: session.boundaries });
    expect(result).toMatchObject({ ok: false, refusal: { code: "scope-not-rebuilt" } });
  });

  it("classifies each answered key four ways", () => {
    expect(classifyKey({ moved: false, value: 1 }, { moved: false, value: 1 })).toBe("agree");
    expect(classifyKey({ moved: true, value: 2 }, { moved: true, value: 2 })).toBe("agree");
    expect(classifyKey({ moved: true, value: 2 }, { moved: true, value: 3 })).toBe("disagree");
    expect(classifyKey({ moved: true, value: 2 }, { moved: false, value: 1 })).toBe("judge-moved");
    expect(classifyKey({ moved: false, value: 1 }, { moved: true, value: 0 })).toBe("extractor-moved");
    expect([0.7, 0.85, 0.92, 0.97, null].map(confidenceBand)).toEqual(["<0.8", "0.8-0.9", "0.9-0.95", ">=0.95", "unknown"]);
  });

  it("golden: the recorded extractor replies replay to the archived summary (synthetic; no model was called)", () => {
    const fixture = readFixture();
    const session = readSessionArchive(fixture);
    const rebuilt = rebuildSession(session, story);
    const compared = compareCases({ cases: rebuilt.cases, story, replies: fixture.replies });
    const summary = summarizeReplay(compared, rebuilt.refusals, rebuilt.cases.length);
    const sample = arbitrationSample(compared.rows).map((row) => ({ case: row.caseId, key: row.key, run: row.run, class: row.class }));
    const golden = { summary, arbitrationSample: sample };
    if (process.env.SO_J6D_WRITE === "1") {
      fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
      fs.writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`);
    }
    expect(golden).toEqual(JSON.parse(fs.readFileSync(GOLDEN, "utf8")));
    expect(summary.verdict).toBe("rate");
    expect(summary.perRun.map((row) => row.keys)).toEqual([28, 28]);
    expect(summary.perRun.map((row) => row.classes)).toEqual([
      { "agree": 26, "disagree": 1, "judge-moved": 1, "extractor-moved": 0 },
      { "agree": 26, "disagree": 1, "judge-moved": 0, "extractor-moved": 1 },
    ]);
    expect(summary.pooled.disagreementRate).toBeCloseTo(4 / 56);
    expect(summary.buildLiveShadow).toBe(false);
  });

  it("insufficient under 20 rebuilt keys per run, deferred with no extractor replies, refused replies kept out of the rate", () => {
    const fixture = readFixture();
    const rebuilt = rebuildSession(readSessionArchive(fixture), story);
    const few = rebuilt.cases.slice(0, 4);
    expect(few.reduce((sum, entry) => sum + entry.answered.length, 0)).toBeLessThan(J6D_MIN_KEYS);
    const thin = summarizeReplay(compareCases({ cases: few, story, replies: fixture.replies }), [], few.length);
    expect(thin.verdict).toBe("insufficient");
    expect(thin.pooled.disagreementRate).toBeNull();
    const none = summarizeReplay(compareCases({ cases: rebuilt.cases, story, replies: {} }), rebuilt.refusals, rebuilt.cases.length);
    expect(none).toMatchObject({ verdict: "deferred", unaskedCases: 7 });
    const cut = { ...fixture.replies, [rebuilt.cases[0].id]: [{ text: "DELTA q=has_map value=true", finish: "length" as const }, fixture.replies[rebuilt.cases[0].id][1]] };
    const compared = compareCases({ cases: rebuilt.cases, story, replies: cut });
    expect(compared.refusedReplies).toEqual([{ caseId: rebuilt.cases[0].id, run: 0, reason: "truncated response" }]);
    expect(summarizeReplay(compared, [], rebuilt.cases.length).perRun[0].keys).toBe(24);
  });

  it("an answer outside the window's evidence is not an extractor move", () => {
    const fixture = readFixture();
    const { cases } = rebuildSession(readSessionArchive(fixture), story);
    const replayCase = cases.find((entry) => entry.window.to === 8)!;
    const compared = compareCases({ cases: [replayCase], story, replies: { [replayCase.id]: [{ text: 'DELTA q=smith_trust value=3 evidence="words nobody said"' }] } });
    expect(compared.rows.find((row) => row.key === "smith_trust")).toMatchObject({ extractor: 1, class: "agree" });
  });
});
