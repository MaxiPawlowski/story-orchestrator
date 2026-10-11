import type { CuratorScope } from "@stagecraft/types";
import { parseCuratorResponse, planCuratorProposal } from "@stagecraft/index";
import { curatorIndexArm, INDEX_FULL_LIMIT, refuseIndexEdits } from "./curatorIndexArm";

const scope = (): CuratorScope => ({
  storyTitle: "Synthetic index test", checkpointName: "Harbour", objective: "Keep the harbour open", canon: "The ferry arrived.", openArcs: [],
  entries: Array.from({ length: 50 }, (_, index) => ({ lorebook: "SO-Index", uid: index, comment: index === 0 ? "Ferry" : `Entry ${index}`, keys: [index === 0 ? "ferry" : `key${index}`], content: `Private body ${index} ${"x".repeat(300)}`, disabled: false })),
});

const scored = (raw: string, indexed: boolean) => {
  const input = scope();
  const proposal = parseCuratorResponse(raw, input.entries);
  const plan = planCuratorProposal(proposal, input.entries, { mode: "review" });
  return indexed ? refuseIndexEdits(plan, curatorIndexArm(input)) : plan;
};

describe("C13-b calibration-only title index", () => {
  it("keeps matching content, hides other content, and records the unchanged ratio floor", () => {
    const arm = curatorIndexArm(scope());
    expect(arm.full.map((entry) => entry.comment)).toEqual(["Ferry"]);
    expect(arm.titleOnly).toHaveLength(49);
    expect(arm.prompt).toContain("Private body 0");
    expect(arm.prompt).not.toContain("Private body 1");
    expect(arm.prompt).toContain('"Entry 1" [currently on]');
    expect(arm.ratio).toBeLessThanOrEqual(0.40);
  });

  it("caps full entries at 16, preserves authored order, and refuses a too-small arm", () => {
    const input = scope();
    input.entries.forEach((entry) => { entry.keys = ["harbour"]; });
    expect(curatorIndexArm(input).full).toEqual(input.entries.slice(0, INDEX_FULL_LIMIT));
    expect(() => curatorIndexArm({ ...input, entries: input.entries.slice(0, 39) })).toThrow(/at least 40/);
  });

  it("counts a title-only rewrite as a rejected operation, while the full-text control accepts it", () => {
    const raw = '[rewrite] Entry 1 || A new body.';
    const arm = scored(raw, true);
    expect(arm.records).toHaveLength(0);
    expect(arm.dropped.join(" ")).toContain("only the title");
    expect(scored(raw, false).records).toHaveLength(1);
  });

  it("still allows title-only enable/disable and a full-content rewrite", () => {
    expect(scored('[disable] Entry 1\n[rewrite] Ferry || The ferry stopped.', true).records.map((record) => record.op.kind).sort()).toEqual(["disable", "rewrite"]);
  });
});
