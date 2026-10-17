import type { E0ChatRow } from "./e0Pool";
import {
  checkpointAt, filteredCandidates, memberKey, mergeVr62Labels, noFilter, presenceFilter, readVr62Labels, sceneInputAt, sceneKey, sceneRecordFrom, scoreVr62,
  secretScenes, vr62Agreed, vr62Minimums, vr62Top, vr62WrittenProblem, VR62_LABELS_FORMAT, VR62_POOL_FORMAT, type Vr62Pool, type Vr62PoolQuestion, type Vr62Question,
  type Vr62SceneRecord, type Vr62SessionContext,
} from "./vr62";

const names = ["Mara", "Ben", "Ula", "Odo"];
const rows: E0ChatRow[] = Array.from({ length: 40 }, (_, id) => ({ id, name: id % 5 === 0 ? "Rin" : names[id % 4], isUser: id % 5 === 0, text: `message number ${id} about the harbour` }));
const context: Vr62SessionContext = {
  session: "T9/T9-1", storyTitle: "Story", player: "Rin", members: names, roles: { Mara: "smith" },
  checkpoints: { a: { name: "Gate", objective: "Get in" }, b: { name: "Hall", objective: "Talk" } },
  log: [{ lastMessageId: 3, before: "a", after: "a" }, { lastMessageId: 12, before: "a", after: "b" }], startCheckpoint: "a",
  epistemic: [{ tag: "hiding", messageId: 2 }, { tag: "unaware", messageId: 20 }, { tag: "knows", messageId: 5 }, { tag: "hiding", messageId: 39 }],
};

describe("v2.8 21 §6.2 rules", () => {
  it("refuses a non-member and an exclusion whose gold is the member's own message", () => {
    const base = { askMessageId: 30, member: "Mara", text: "What did Ben call the ship?", gold: [10], witnessed: true };
    expect(vr62WrittenProblem(rows, names, base)).toBeNull();
    expect(vr62WrittenProblem(rows, names, { ...base, member: "Zed" })).toBe("member is not a session member");
    expect(vr62WrittenProblem(rows, names, { ...base, witnessed: false, gold: [12] })).toBe("exclusion gold is the member's own message");
    expect(vr62WrittenProblem(rows, names, { ...base, askMessageId: 31 })).toBe("asking turn is not a player message");
  });

  it("agreement needs the answer inside the gold and the same witnessed verdict", () => {
    const written = { askMessageId: 30, member: "Mara", text: "q", gold: [10, 11], witnessed: false };
    expect(vr62Agreed(written, { answerable: true, ids: [10], memberWitnessed: false })).toBe(true);
    expect(vr62Agreed(written, { answerable: true, ids: [10], memberWitnessed: true })).toBe(false);
    expect(vr62Agreed(written, { answerable: true, ids: [12], memberWitnessed: false })).toBe(false);
    expect(vr62Agreed(written, { answerable: false, ids: [10], memberWitnessed: false })).toBe(false);
    expect(vr62Agreed(written, { answerable: true, ids: [10], memberWitnessed: null })).toBe(false);
  });

  it("merge drops nothing silently: disagreements stay agreed:false, nonces only on exclusions", () => {
    const chats = new Map([["T9/T9-1", { rows, members: names }]]);
    let n = 0;
    const merged = mergeVr62Labels([
      { id: "a", session: "T9/T9-1", written: { askMessageId: 30, member: "Mara", text: "What did Ben call it?", gold: [10], witnessed: true }, check: { answerable: true, ids: [10], memberWitnessed: true } },
      { id: "b", session: "T9/T9-1", written: { askMessageId: 30, member: "Mara", text: "What did Ula say?", gold: [11], witnessed: false }, check: { answerable: true, ids: [11], memberWitnessed: false } },
      { id: "c", session: "T9/T9-1", written: { askMessageId: 30, member: "Ben", text: "What did Odo say?", gold: [11], witnessed: false }, check: { answerable: true, ids: [11], memberWitnessed: true } },
      { id: "d", session: "T9/T9-1", written: { askMessageId: 30, member: "Ben", text: "x", gold: [11], witnessed: true }, check: null },
    ], chats, () => `n${(n += 1)}`);
    expect(merged.counts).toEqual({ written: 4, invalid: 0, unchecked: 1, agreed: 2, disagreed: 1 });
    expect(merged.labels.questions.map((question) => [question.id, question.kind, question.nonce ?? null])).toEqual([["a", "positive", null], ["b", "exclusion", "n1"], ["c", "exclusion", "n2"]]);
    const read = readVr62Labels(merged.labels);
    expect(read.questions.map((question) => question.id)).toEqual(["a", "b"]);
    expect(read.dropped).toEqual({ disagreed: 1, invalid: 0 });
  });

  it("checkpoints come from the boundary log; secret scenes count hiding/unaware rows up to the last asking turn", () => {
    expect(checkpointAt(context, 0)).toBe("a");
    expect(checkpointAt(context, 12)).toBe("b");
    expect(checkpointAt({ log: [], startCheckpoint: "a" }, 5)).toBe("a");
    expect(secretScenes(context, 30)).toEqual(["T9/T9-1:a", "T9/T9-1:b"]);
    expect(secretScenes(context, 10)).toEqual(["T9/T9-1:a"]);
  });

  it("the scene read asks the tracker family over the 8 spoken messages ending at the candidate", () => {
    const input = sceneInputAt(context, rows, 20);
    expect(input.window).toHaveLength(8);
    expect(input.window.at(-1)?.text).toBe("message number 20 about the harbour");
    expect(input.window.at(-1)?.speaker).toBe("Rin");
    expect(input.families).toEqual({ sceneBreak: false, tracker: true, lookahead: false });
    expect(input.checkpointName).toBe("Hall");
    expect(input.cast[0]).toEqual({ rosterId: "m0", name: "Mara", role: "smith" });
    const record = sceneRecordFrom(context, rows, 20, { answers: { [`present:${memberKey(names, "Mara")}`]: { type: "noul", noul: 0.9 }, "present:m1": { type: "noul", noul: 0.2 } }, latencyMs: 5, model: "jev" });
    expect(record.present).toEqual({ Mara: 0.9, Ben: 0.2 });
    expect(sceneRecordFrom(context, rows, 20, { answers: null, fallback: "too-large", latencyMs: 0 })).toMatchObject({ present: null, fallback: "too-large" });
  });
});

const scene = (present: Record<string, number> | null): Vr62SceneRecord => ({ present, fallback: present ? null : "error", model: "jev", latencyMs: 1, inputTokens: 10, cached: false });

const poolQuestion = (id: string, member: string, kind: "positive" | "exclusion", gold: number, ids: number[], session = "T9/T9-1"): Vr62PoolQuestion => ({
  id, session, askMessageId: 39, member, kind, gold: [gold], query: "q",
  candidates: ids.map((messageId, stRank) => ({ messageId, speaker: rows[messageId].isUser ? "" : rows[messageId].name, textHash: "h", text: rows[messageId].text, stRank })),
});

describe("v2.8 21 §6.2 filter, rank and score", () => {
  it("presence keeps the speaker, a present member, and fails closed on a missing read", () => {
    const scenes = { [sceneKey("T9/T9-1", 1)]: scene({ Odo: 0.95 }), [sceneKey("T9/T9-1", 2)]: scene({ Odo: 0.4 }), [sceneKey("T9/T9-1", 3)]: scene(null) };
    const question = poolQuestion("q", "Odo", "positive", 1, [1, 2, 3, 4, 5]);
    expect(filteredCandidates(question, presenceFilter(scenes)).map((candidate) => candidate.messageId)).toEqual([1, 3]);
    expect(filteredCandidates(question, noFilter)).toHaveLength(5);
  });

  it("four or fewer candidates need no call; more refuse without four recorded calls and rank by the picks", () => {
    const question = poolQuestion("q", "Ben", "positive", 3, [1, 2, 3, 4, 6, 7]);
    expect(vr62Top(question, question.candidates.slice(0, 4), undefined)).toEqual({ top: [1, 2, 3, 4], calls: 0, latencyMs: 0, inputTokens: 0 });
    expect(vr62Top(question, question.candidates, undefined)).toEqual({ refused: "no recorded calls" });
    const calls = [7, 6, 99, 2].map((pick) => ({ pick, latencyMs: 10, inputTokens: 5 }));
    expect(vr62Top(question, question.candidates, calls)).toMatchObject({ top: [7, 6, 2, 1], calls: 4, latencyMs: 40 });
  });

  const fixture = () => {
    const questions: Vr62Question[] = [];
    const pooled: Vr62PoolQuestion[] = [];
    const scenes: Record<string, Vr62SceneRecord> = {};
    const sessions = ["T9/T9-1", "T9/T9-2"];
    for (let index = 0; index < 20; index += 1) {
      const member = names[index % 3];
      const session = sessions[index % 2];
      const review = { writer: "w", checker: "c", agreed: true };
      questions.push({ id: `p${index}`, session, askMessageId: 39, member, kind: "positive", text: "q", gold: [21], review });
      pooled.push(poolQuestion(`p${index}`, member, "positive", 21, [21, 22, 23], session));
      questions.push({ id: `x${index}`, session, askMessageId: 39, member, kind: "exclusion", text: "q", gold: [25], nonce: `nonce${index}`, review });
      pooled.push(poolQuestion(`x${index}`, member, "exclusion", 25, [25, 22, 23], session));
    }
    for (const session of sessions) {
      [21, 22, 23].forEach((id) => { scenes[sceneKey(session, id)] = scene({ Mara: 0.9, Ben: 0.9, Ula: 0.9 }); });
      scenes[sceneKey(session, 25)] = scene({ Mara: 0.1, Ben: 0.1, Ula: 0.1 });
    }
    const labels = readVr62Labels({ format: VR62_LABELS_FORMAT, source: "private", questions });
    const pool: Vr62Pool = { format: VR62_POOL_FORMAT, source: "private", provider: "stub", topK: 32, protect: 5, questions: pooled, refused: [] };
    return { labels, pool, scenes, secret: ["T9/T9-1:a", "T9/T9-2:b"] };
  };

  it("passes when presence keeps the witnessed gold and drops the unwitnessed one", () => {
    const { labels, pool, scenes, secret } = fixture();
    const result = scoreVr62(labels, pool, scenes, {}, secret);
    expect(result.vr1).toEqual({ hits: 20, of: 20, rate: 1 });
    expect(result.vr2).toEqual({ nonceLines: 0, exclusions: 20 });
    expect(result.diagnosticUnfiltered.exclusionsLeaked).toBe(20);
    expect(result.verdict).toEqual({ status: "pass", rGate2: true });
  });

  it("a filter that returns nothing passes VR2 vacuously and fails VR1, so the run fails", () => {
    const { labels, pool, scenes, secret } = fixture();
    const result = scoreVr62(labels, pool, scenes, {}, secret, () => false);
    expect(result.vr2.nonceLines).toBe(0);
    expect(result.vr1.rate).toBe(0);
    expect(result.verdict.status).toBe("fail");
  });

  it("an everyone-present filter leaks every nonce and fails VR2", () => {
    const { labels, pool, scenes, secret } = fixture();
    const result = scoreVr62(labels, pool, scenes, {}, secret, noFilter);
    expect(result.vr2.nonceLines).toBe(20);
    expect(result.floors.vr2).toBe(false);
    expect(result.verdict.status).toBe("fail");
  });

  it("a fixture under the minimums is refused, not scored", () => {
    const { labels, pool, scenes } = fixture();
    expect(scoreVr62(labels, pool, scenes, {}, ["T9/T9-1:a"]).verdict.status).toBe("insufficient");
    expect(vr62Minimums(labels.questions.slice(0, 2), ["a", "b"]).met).toMatchObject({ positives: false, exclusions: false, askers: false, sessions: false });
  });
});
