import type { Story } from "@engine/index";
import { applyGameOp, gameOpProblem, readGameCall } from "@copilot/agent/gameOps";
import { addRumor, removeRumor, setMemberGossip, updateRumor } from "./gameMutations";
import type { StoryDraft } from "./draft";

const draft = (patch: Partial<Story> = {}): Story => ({
  title: "T", description: "D", transitions: [],
  qualities: [{ key: "confessed", type: "bool", source: "extractor", rubric: "Did Mara confess?" }],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }],
  roster: [{ id: "mara", name: "Mara" }, { id: "ben", name: "Ben" }],
  ...patch,
});

describe("v2.8 plan 44: the setRumors wizard tool and the Studio mutations", () => {
  it("refuses a malformed channel or rumor before it reaches the draft", () => {
    expect(readGameCall("setRumors", { rumors: [{ id: "x", from: "mara", claim: "news" }], gossip: { mara: { talks_to: ["ben"], hops: 9 } } })).toMatchObject({ ok: false });
    expect(readGameCall("setRumors", { rumors: [{ id: "x", claim: "news" }] })).toMatchObject({ ok: false });
  });

  it("applies rumors and channels, clears a channel given null, and names a self-channel or unknown member as a problem", () => {
    const call = readGameCall("setRumors", { rumors: [{ id: "flood", from: "mara", claim: "the ford flooded" }], gossip: { mara: { talks_to: ["ben"], contact: "any" } } });
    if (!call.ok) throw new Error(call.message);
    const next = applyGameOp(draft(), call.op);
    expect(next.rumors).toEqual([{ id: "flood", from: "mara", claim: "the ford flooded" }]);
    expect(next.roster[0].gossip).toEqual({ talks_to: ["ben"], contact: "any" });
    expect(gameOpProblem(draft(), call.op)).toBeNull();
    const cleared = readGameCall("setRumors", { rumors: [], gossip: { mara: null } });
    if (!cleared.ok) throw new Error(cleared.message);
    expect(applyGameOp(next, cleared.op)).toMatchObject({ roster: [{ id: "mara", name: "Mara" }, { id: "ben", name: "Ben" }] });
    expect(applyGameOp(next, cleared.op).rumors).toBeUndefined();
    const self = readGameCall("setRumors", { rumors: [], gossip: { mara: { talks_to: ["mara"] } } });
    if (!self.ok) throw new Error(self.message);
    expect(gameOpProblem(draft(), self.op)).toContain("does not pass news to itself");
    const ghost = readGameCall("setRumors", { rumors: [{ id: "x", from: "ghost", claim: "news" }] });
    if (!ghost.ok) throw new Error(ghost.message);
    expect(gameOpProblem(draft(), ghost.op)).toContain("'ghost' is not in the cast");
  });

  it("adds, edits, compacts and removes rumors; a member's channel is set or dropped", () => {
    const added = addRumor(draft() as StoryDraft);
    expect(added.rumors).toEqual([{ id: "rumor", from: "mara", claim: "news worth passing on" }]);
    const edited = updateRumor(added, "rumor", { versions: [], leaks_to: [{ member: "ben", when: { q: "confessed", op: "==", v: true } }] });
    expect(edited.rumors?.[0]).toEqual({ id: "rumor", from: "mara", claim: "news worth passing on", leaks_to: [{ member: "ben", when: { q: "confessed", op: "==", v: true } }] });
    expect(removeRumor(edited, "rumor").rumors).toBeUndefined();
    expect(setMemberGossip(edited, "ben", { talks_to: ["mara"] }).roster[1].gossip).toEqual({ talks_to: ["mara"] });
    expect(setMemberGossip(setMemberGossip(edited, "ben", { talks_to: ["mara"] }), "ben", undefined).roster[1]).toEqual({ id: "ben", name: "Ben" });
  });
});
