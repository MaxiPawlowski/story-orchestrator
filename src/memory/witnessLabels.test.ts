import type { E0ChatRow } from "./e0Pool";
import { labWitnessSession, mergeWitnessSession, readWitnessDrafts, resolveDraftSpans, sameAudience, sessionMembers, witnessLabelPrompt, witnessWindow, type WitnessDraft } from "./witnessLabels";
import { combineWitnessScores, presencePredict, scoreWitness } from "./witness/score";

const rows: E0ChatRow[] = Array.from({ length: 30 }, (_, id) => ({
  id, name: id % 3 === 0 ? "Rin" : id % 3 === 1 ? "Mara" : "Ben", isUser: id % 3 === 0, text: id === 7 ? "Mara waves to all. She leans to Ben and whispers: the key is under the anvil." : `line ${id}`,
}));
const members = ["Mara", "Ben", "Ula"];

describe("witness label rules", () => {
  it("members are the non-player speakers and the window is the middle 12 spoken messages", () => {
    expect(sessionMembers(rows)).toEqual(["Mara", "Ben"]);
    expect(witnessWindow(rows)).toEqual(Array.from({ length: 12 }, (_, index) => index + 9));
    expect(witnessWindow(rows.slice(0, 8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("the prompt names the members, the ids to label and stops at the window's end", () => {
    const prompt = witnessLabelPrompt(rows, members, [5, 6, 7]);
    expect(prompt).toContain("Mara, Ben, Ula");
    expect(prompt).toContain("LABEL: 5, 6, 7");
    expect(prompt).toContain("[7] Mara:");
    expect(prompt).not.toContain("[8]");
  });

  it("reads drafts, resolving names and refusing non-members", () => {
    const read = readWitnessDrafts({ labels: [
      { messageId: 1, present: ["mara", "Ben"], heard: ["MARA"] },
      { messageId: 2, present: ["Mara"], heard: ["Zed"] },
      { messageId: 3, present: ["Mara", "Ben"], heard: "unknown" },
      { messageId: 7, present: ["Mara", "Ben", "Ula"], mixed: true, spans: [{ from: "Mara waves to all.", heard: ["Mara", "Ben", "Ula"] }, { from: "the key is under", heard: ["Ben", "Mara"] }] },
      { messageId: 8, present: ["Mara"], mixed: true, spans: [] },
    ] }, members);
    expect(read.drafts.map((draft) => draft.messageId)).toEqual([1, 3, 7]);
    expect(read.drafts[0]).toEqual({ messageId: 1, present: ["Ben", "Mara"], heard: ["Mara"] });
    expect(read.problems.map((problem) => problem.reason)).toEqual(["heard names a non-member", "mixed label with a malformed span"]);
  });

  it("agreement compares present and audience, spans in order", () => {
    const one: WitnessDraft = { messageId: 1, present: ["Ben", "Mara"], heard: ["Ben", "Mara"] };
    expect(sameAudience(one, { ...one, heard: ["Mara", "Ben"] }, true)).toBe(true);
    expect(sameAudience(one, { ...one, present: ["Mara"] }, true)).toBe(false);
    expect(sameAudience(one, { ...one, present: ["Mara"] }, false)).toBe(true);
    expect(sameAudience(one, { ...one, heard: "unknown" }, true)).toBe(false);
    const mixed: WitnessDraft = { messageId: 7, present: ["Ben", "Mara"], heard: "unknown", spans: [{ from: "a", heard: ["Ben", "Mara"] }, { from: "b", heard: ["Ben"] }] };
    expect(sameAudience(mixed, { ...mixed, spans: [{ from: "x", heard: ["Mara", "Ben"] }, { from: "y", heard: ["Ben"] }] }, true)).toBe(true);
    expect(sameAudience(mixed, { ...mixed, spans: [{ from: "x", heard: ["Ben"] }] }, true)).toBe(false);
    expect(sameAudience(mixed, one, true)).toBe(false);
  });

  it("span anchors resolve by exact unique substring, in order", () => {
    const text = "Mara waves to all. She leans to Ben and whispers: the key is under the anvil.";
    expect(resolveDraftSpans(text, [{ from: "Mara waves", heard: ["Ben"] }, { from: "the key is", heard: ["Ben"] }])).toEqual([
      { span: [0, 50], heard: ["Ben"] }, { span: [50, text.length], heard: ["Ben"] },
    ]);
    expect(resolveDraftSpans(text, [{ from: "the", heard: ["Ben"] }])).toBeNull();
    expect(resolveDraftSpans(text, [{ from: "the key is", heard: ["Ben"] }, { from: "Mara waves", heard: ["Ben"] }])).toBeNull();
    expect(resolveDraftSpans(text, [{ from: "not there", heard: ["Ben"] }])).toBeNull();
  });

  it("merge keeps disagreements as agreed:false so the scorer drops and counts them; a bad anchor is invalid", () => {
    const window = [5, 6, 7];
    const written: WitnessDraft[] = [
      { messageId: 5, present: ["Ben", "Mara"], heard: ["Ben", "Mara"] },
      { messageId: 6, present: ["Ben", "Mara"], heard: ["Mara"] },
      { messageId: 7, present: ["Ben", "Mara"], heard: "unknown", spans: [{ from: "nowhere at all", heard: ["Ben"] }] },
    ];
    const checked: WitnessDraft[] = [written[0], { ...written[1], heard: ["Ben", "Mara"] }, written[2]];
    const merged = mergeWitnessSession({ session: "T9/T9-1", rows, members, window, written, checked }, "sol", "claude");
    expect(merged.counts).toEqual({ written: 3, unchecked: 0, invalid: 1, agreed: 1, disagreed: 1 });
    expect(merged.set.labels.map((label) => label.review?.agreed)).toEqual([true, false]);
    const score = scoreWitness(merged.set, presencePredict(merged.set));
    expect(score.messages).toBe(1);
    expect(score.dropped).toBe(1);
  });

  it("the lab session keeps authored heard sets and folds listeners into present", () => {
    const lab = labWitnessSession([
      { index: 0, scene: "s1", speaker: "player", text: "Hello all.", heard: ["Mara", "Ben", "player"], presence: ["Mara"] },
      { index: 1, scene: "s1", speaker: "Mara", text: "Psst, Ben.", heard: ["Ben", "Mara"], presence: ["Mara", "Ben", "Ula"] },
    ], members);
    expect(lab.written).toEqual([{ messageId: 0, present: ["Ben", "Mara"], heard: ["Ben", "Mara"] }, { messageId: 1, present: ["Ben", "Mara", "Ula"], heard: ["Ben", "Mara"] }]);
    expect(lab.session.rows[0]).toMatchObject({ isUser: true, name: "Player" });
    expect(lab.scenes.get(1)).toBe("s1");
  });

  it("combined scores sum counts across sessions and re-apply the floors", () => {
    const set = (name: string, n: number) => ({ format: "so-witness-labels/1" as const, set: name, synthetic: true, members: ["a", "b"],
      labels: Array.from({ length: n }, (_, messageId) => ({ messageId, present: ["a", "b"], heard: ["a"], review: null })) });
    const scores = [set("x", 25), set("y", 20)].map((entry) => scoreWitness(entry, presencePredict(entry)));
    expect(scores.map((score) => score.verdict)).toEqual(["insufficient", "insufficient"]);
    const combined = combineWitnessScores("both", scores);
    expect(combined.messages).toBe(45);
    expect(combined.falseInclusion).toEqual({ hits: 45, of: 45, rate: 1 });
    expect(combined.asideExactSet).toEqual({ hits: 0, of: 45, rate: 0 });
    expect(combined.verdict).toBe("fail");
  });
});
