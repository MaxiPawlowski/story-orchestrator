import { capProposalRing } from "./types";
import { parseStoryV2OrThrow } from "@engine/index";
import { buildWiCuratorPrompt } from "./prompt";
import { parseCuratorResponse } from "./parse";
import { applyCuratorPatch, planCuratorProposal, previewCuratorOp, splitPatchAnchor } from "./proposal";
import { curatorHasScope, curatorLorebooks, entriesForScope, isCheckpointGated, isCuratorWritable } from "./scope";
import type { CuratorEntryView } from "./types";

const entries = (): CuratorEntryView[] => [
  { lorebook: "Story Lore", comment: "The bridge", keys: ["bridge"], content: "The bridge stands, its ropes new and taut. Travellers cross freely.", disabled: false },
  { lorebook: "Story Lore", comment: "The ferryman", keys: ["ferryman"], content: "Nobody has seen the ferryman for a season.", disabled: true },
];

const story = (stagecraft?: { lorebooks: string[] }) => parseStoryV2OrThrow({
  format: 2,
  id: "curator-fixture",
  title: "Curator fixture",
  description: "Scope.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  ...(stagecraft ? { stagecraft } : {}),
});

describe("curator scope", () => {
  it("is exactly the authored allowlist, and nothing without one", () => {
    expect(curatorLorebooks(story({ lorebooks: ["Story Lore"] }))).toEqual(["Story Lore"]);
    expect(curatorHasScope(story())).toBe(false);
    expect(curatorLorebooks(story())).toEqual([]);
  });

  it("never treats a book outside the allowlist as writable", () => {
    const scoped = story({ lorebooks: ["Story Lore"] });
    expect(isCuratorWritable(scoped, "story lore", "The bridge")).toBe(true);
    expect(isCuratorWritable(scoped, "The User's Own Book", "The bridge")).toBe(false);
    expect(isCuratorWritable(story(), "Story Lore", "The bridge")).toBe(false);
  });

  it("never treats an entry a checkpoint switches as writable, even inside the allowlist", () => {
    const gated = parseStoryV2OrThrow({
      ...JSON.parse(JSON.stringify(story({ lorebooks: ["Story Lore"] }))),
      checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true, effects: { world_info: { enable: [{ lorebook: "Story Lore", comments: ["The ferryman"] }] } } }],
    });
    expect(isCheckpointGated(gated, "story lore", "the ferryman")).toBe(true);
    expect(isCuratorWritable(gated, "Story Lore", "The ferryman")).toBe(false);
    expect(isCuratorWritable(gated, "Story Lore", "The bridge")).toBe(true);
    expect(isCheckpointGated(gated, "Other Book", "The ferryman")).toBe(false);
  });

  it("reads host entries into the view the prompt and the planner share", () => {
    expect(entriesForScope("Story Lore", [
      { comment: " The bridge ", content: "text", key: ["bridge", 7], disable: true },
      { comment: "  ", content: "ignored" },
    ])).toEqual([{ lorebook: "Story Lore", comment: "The bridge", keys: ["bridge"], content: "text", disabled: true }]);
  });
});

describe("curator prompt", () => {
  it("lists only the entries it may touch and asks for NONE by default", () => {
    const prompt = buildWiCuratorPrompt({
      storyTitle: "Crossing",
      checkpointName: "The bank",
      objective: "Cross the river",
      canon: "The flood took the bridge.",
      openArcs: ["Who cut the ropes?"],
      entries: entries(),
    });
    expect(prompt).toContain('"The bridge" (Story Lore)');
    expect(prompt).toContain('"The ferryman" (Story Lore) [currently off]');
    expect(prompt).toContain("If nothing needs changing, output NONE.");
    expect(prompt).toContain("The flood took the bridge.");
    expect(prompt).toContain("Who cut the ropes?");
  });
});

describe("curator parse", () => {
  it("reads every op kind and the why line", () => {
    const proposal = parseCuratorResponse([
      "[enable] The ferryman",
      "[disable] The bridge",
      "[rewrite] The ferryman || The ferryman is back, poling a flat skiff.",
      "[patch] The bridge || The bridge stands || cross freely || The bridge is gone, its ropes cut.",
      "[why] The flood took the bridge and the ferryman returned.",
    ].join("\n"), entries());
    expect(proposal.summary).toBe("The flood took the bridge and the ferryman returned.");
    expect(proposal.ops).toEqual([
      { kind: "enable", lorebook: "Story Lore", comment: "The ferryman" },
      { kind: "disable", lorebook: "Story Lore", comment: "The bridge" },
      { kind: "rewrite", lorebook: "Story Lore", comment: "The ferryman", text: "The ferryman is back, poling a flat skiff." },
      { kind: "patch", lorebook: "Story Lore", comment: "The bridge", anchor: "The bridge stands || cross freely", replace: "The bridge is gone, its ropes cut." },
    ]);
    expect(proposal.dropped).toEqual([]);
  });

  it("returns nothing for NONE and tolerates channel noise, bullets and bare tags", () => {
    expect(parseCuratorResponse("<|channel|>final<|message|>NONE", entries()).ops).toEqual([]);
    expect(parseCuratorResponse("- enable: The ferryman", entries()).ops).toEqual([
      { kind: "enable", lorebook: "Story Lore", comment: "The ferryman" },
    ]);
  });

  it("drops an entry the story does not own instead of writing it", () => {
    const proposal = parseCuratorResponse("[rewrite] Someone Else's Entry || anything at all", entries());
    expect(proposal.ops).toEqual([]);
    expect(proposal.dropped[0]).toContain("is not an entry this story owns");
  });

  it("caps the number of changes and the replacement length", () => {
    const proposal = parseCuratorResponse([
      "[enable] The ferryman",
      "[disable] The bridge",
      `[rewrite] The bridge || ${"x".repeat(900)}`,
      "[patch] The ferryman || Nobody has || for a season || is back",
      "[enable] The bridge",
    ].join("\n"), entries());
    expect(proposal.ops).toHaveLength(4);
    expect(proposal.dropped.some((entry) => entry.includes("over the 4-change cap"))).toBe(true);
    const rewrite = proposal.ops.find((op) => op.kind === "rewrite");
    expect(rewrite && "text" in rewrite ? rewrite.text.length : 0).toBe(600);
  });

  it("accepts the shortened three-part patch form", () => {
    const proposal = parseCuratorResponse("[patch] The bridge || its ropes new and taut ... cross freely || its ropes cut.", entries());
    expect(proposal.ops[0]).toEqual({ kind: "patch", lorebook: "Story Lore", comment: "The bridge", anchor: "its ropes new and taut ... cross freely", replace: "its ropes cut." });
  });
});

describe("patch boundary syntax", () => {
  it("splits first/last anchors written either way", () => {
    expect(splitPatchAnchor("The bridge stands || cross freely")).toEqual({ head: "The bridge stands", tail: "cross freely" });
    expect(splitPatchAnchor("The bridge stands ... cross freely")).toEqual({ head: "The bridge stands", tail: "cross freely" });
    expect(splitPatchAnchor("The bridge stands")).toEqual({ head: "The bridge stands", tail: "" });
  });

  it("replaces the span between the anchors, ignoring how whitespace was typed", () => {
    const result = applyCuratorPatch("The bridge stands, its ropes new and taut. Travellers cross freely. Then the road.", "The bridge   stands || cross freely", "The bridge is gone.");
    expect(result).toEqual({ ok: true, content: "The bridge is gone. Then the road." });
  });

  it("keeps punctuation the tail anchor did not cover", () => {
    expect(applyCuratorPatch("The bridge stands, its ropes taut; travellers cross freely, always.", "its ropes taut || cross freely", "its ropes cut").content)
      .toBe("The bridge stands, its ropes cut, always.");
  });

  it("replaces just the head when no tail is given", () => {
    expect(applyCuratorPatch("Nobody has seen the ferryman for a season.", "Nobody has seen", "Everyone has seen").content)
      .toBe("Everyone has seen the ferryman for a season.");
  });

  it("fails loudly instead of overwriting when an anchor is not there", () => {
    expect(applyCuratorPatch("The bridge stands.", "the tollhouse burned", "gone")).toMatchObject({ ok: false, content: "The bridge stands." });
    expect(applyCuratorPatch("The bridge stands.", "The bridge || the tollhouse", "gone")).toMatchObject({ ok: false });
  });
});

describe("planCuratorProposal", () => {
  it("previews each op and drops the ones that would change nothing", () => {
    const plan = planCuratorProposal(parseCuratorResponse([
      "[enable] The bridge",
      "[disable] The ferryman",
      "[rewrite] The bridge || The bridge stands, its ropes new and taut. Travellers cross freely.",
    ].join("\n"), entries()), entries());
    expect(plan.records).toEqual([]);
    expect(plan.dropped).toEqual([
      'rewrite: "The bridge" already reads that way',
      'enable: "The bridge" is already on',
      'disable: "The ferryman" is already off',
    ]);
  });

  it("puts text edits before on/off flips so a disable survives the write", () => {
    const plan = planCuratorProposal(parseCuratorResponse([
      "[disable] The bridge",
      "[rewrite] The bridge || The bridge is gone.",
    ].join("\n"), entries()), entries());
    expect(plan.records.map((record) => record.op.kind)).toEqual(["rewrite", "disable"]);
    expect(plan.records[0].before).toEqual({ content: entries()[0].content, disabled: false });
  });

  it("keeps a duplicate op out and records why", () => {
    const plan = planCuratorProposal(parseCuratorResponse([
      "[rewrite] The bridge || The bridge is gone.",
      "[rewrite] The bridge || The bridge is also gone.",
    ].join("\n"), entries()), entries());
    expect(plan.records).toHaveLength(1);
    expect(plan.dropped[0]).toContain("was proposed twice");
  });

  it("reports an op whose entry vanished between proposal and plan", () => {
    const proposal = parseCuratorResponse("[rewrite] The bridge || The bridge is gone.", entries());
    expect(previewCuratorOp(proposal.ops[0], undefined)).toMatchObject({ ok: false });
    expect(planCuratorProposal(proposal, [entries()[1]]).records).toEqual([]);
  });
});

describe("proposal ring (v2.2 plan 05)", () => {
  const record = (id: string, curator: "wi" | "warden") => ({ id, curator, at: "", boundary: 0, messageId: 0, checkpointId: "cp", reason: "", summary: "", mode: "review" as const, ops: [], dropped: [] });
  it("caps each curator on its own, so the warden never evicts a lorebook change", () => {
    const ring = capProposalRing([record("wi-1", "wi"), ...Array.from({ length: 7 }, (_, index) => record(`w-${index}`, "warden"))]);
    expect(ring.map((entry) => entry.id)).toEqual(["wi-1", "w-2", "w-3", "w-4", "w-5", "w-6"]);
  });
});

