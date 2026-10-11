import { CanonSynthesis } from "./canonSynthesis";
import type { MemoryRuntimeState } from "./types";
import type { JudgeRuntime } from "./judge";
import { testOwnership } from "../../test/findings/testOwnership";

function harness() {
  let summary = "They crossed safely.";
  let memory = { entries: [], arcs: [{ id: "arc", text: "The crossing", status: "resolved", summary }], canon: { text: "Old canon.", inputHash: "old", updatedAt: "old" }, canonDraft: null } as unknown as MemoryRuntimeState;
  const record = jest.fn();
  const judge = { active: () => true, ask: async () => ({ answers: { "sentence:0": { type: "noul", noul: 0.95 }, "sentence:1": { type: "noul", noul: 0.02 } } }) } as unknown as JudgeRuntime;
  const synthesis = new CanonSynthesis({
    getStory: () => ({ title: "Crossing", roster: [], checkpointById: {} }) as never,
    getState: () => ({ activeCheckpointId: "cp", boundary: 1, lastMessageId: 3 }) as never,
    memory: () => memory, patch: (patch) => { memory = { ...memory, ...patch }; }, record,
    save: async () => {}, model: () => async () => ({ text: "They crossed safely. They found treasure.", finish: "stop" }), ownership: () => testOwnership(),
    enabled: () => true, firedTransitions: () => [], facts: () => [], restingEntries: (entries) => entries, restingLines: (text) => text, judge: () => judge,
  });
  return { synthesis, record, memory: () => memory, change: () => { summary = "They turned back."; memory = { ...memory, arcs: memory.arcs.map((arc) => ({ ...arc, summary })) }; } };
}

test("checked draft stays out of canon until accepted; unsupported text never reaches the draft", async () => {
  const h = harness();
  expect(await h.synthesis.regenerateCanon(true, true)).toBe(true);
  expect(h.memory().canon?.text).toBe("Old canon.");
  expect(h.memory().canonDraft?.text).toBe("They crossed safely.");
  expect(h.record).not.toHaveBeenCalled();
  expect(await h.synthesis.decideDraft(true)).toBe(true);
  expect(h.memory().canon?.text).toBe("They crossed safely.");
  expect(h.memory().canonDraft).toBeNull();
  expect(h.record).toHaveBeenCalledTimes(1);
});

test("source drift refuses an old draft, while discard always removes it", async () => {
  const h = harness();
  await h.synthesis.regenerateCanon(true, true);
  h.change();
  expect(await h.synthesis.decideDraft(true)).toBe(false);
  expect(h.memory().canon?.text).toBe("Old canon.");
  expect(await h.synthesis.decideDraft(false)).toBe(true);
  expect(h.memory().canonDraft).toBeNull();
});
