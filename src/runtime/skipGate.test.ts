import { parseStoryOrThrow } from "@engine/index";
import { SKIP_COPY, skipBlock, skipTeller, skipViewOf, type SkipGateInput } from "./skipGate";

const open: SkipGateInput = { committed: true, generating: false, outcomePending: false, allowedHere: true, teller: { rosterId: "n", name: "N" }, running: false };

const story = (roster: Record<string, unknown>[], lead?: string) => parseStoryOrThrow({
  title: "Teller", description: "",
  roster,
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", type: "anchor", start: true, objective: "o", ...(lead ? { talk_control: { lead } } : {}) }],
  transitions: [],
});

describe("v3.0 32 S1: when Skip ahead is available", () => {
  it("is open after the first committed reply with a teller, and says why otherwise", () => {
    expect(skipBlock(open)).toBeNull();
    expect(skipBlock({ ...open, committed: false })).toBe("first-reply");
    expect(skipBlock({ ...open, generating: true })).toBe("generating");
    expect(skipBlock({ ...open, outcomePending: true })).toBe("check-pending");
    expect(skipBlock({ ...open, allowedHere: false })).toBe("checkpoint");
    expect(skipBlock({ ...open, teller: null })).toBe("no-teller");
    expect(skipBlock({ ...open, running: true, generating: true })).toBe("busy");
    expect(skipViewOf("generating")).toEqual({ enabled: false, reason: SKIP_COPY.blocked.generating });
    expect(skipViewOf(null)).toEqual({ enabled: true, reason: null });
  });

  it("the teller is the narrator, else the scene lead, and only one who is switched on in the group", () => {
    const both = story([{ id: "arin", name: "Arin" }, { id: "dm", name: "DM", view: "omniscient" }], "arin");
    const all = () => true;
    expect(skipTeller(both, both.checkpointById.a, all)).toEqual({ rosterId: "dm", name: "DM" });
    expect(skipTeller(both, both.checkpointById.a, (name) => name !== "DM")).toEqual({ rosterId: "arin", name: "Arin" });
    const leadless = story([{ id: "arin", name: "Arin" }]);
    expect(skipTeller(leadless, leadless.checkpointById.a, all)).toBeNull();
  });

  it("player copy names no ids or internals", () => {
    expect([...Object.values(SKIP_COPY), ...Object.values(SKIP_COPY.blocked)].filter((text) => typeof text === "string").join(" ")).not.toMatch(/boundary|checkpoint|roster|_id|story_time/i);
  });
});
