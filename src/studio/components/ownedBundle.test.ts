import type { BundledWorkflow } from "@engine/index";
import { censusSites } from "../../../test/findings/ownershipCensus";
import { lapsedBundleCopy, lapsedStageCopy, withBundle } from "./ownedBundle";

const flow = (name: string) => ({ name, graph: {} }) as unknown as BundledWorkflow;

describe("v2.8 small fixes 4: Studio writes after an await check the draft they started on", () => {
  const sites = new Map(censusSites().map((site) => [site.key, site]));

  it("Export with workflows and the staged wizard run check draft ownership after their await", () => {
    expect(sites.get("src/studio/components/StoryEditor.tsx#IllustrationsSection>anonymous")?.hasTokenCheck).toBe(true);
    expect(sites.get("src/studio/components/StudioCopilot.tsx#StagedWizard.run")?.hasTokenCheck).toBe(true);
  });

  it("the bundle merges into the current draft's illustrations, keeping what landed meanwhile", () => {
    const current = { style: "ink", bundle: { "added-meanwhile.json": flow("a") } };
    expect(withBundle(current, { "read.json": flow("b") })).toEqual({ style: "ink", bundle: { "added-meanwhile.json": flow("a"), "read.json": flow("b") } });
    expect(withBundle(current, {})).toBe(current);
    expect(withBundle(undefined, { "read.json": flow("b") })).toEqual({ bundle: { "read.json": flow("b") } });
  });

  it("a lapsed run says why nothing changed", () => {
    expect(lapsedBundleCopy("epoch: draft replaced")).toMatch(/draft changed meanwhile \(epoch: draft replaced\), so no workflow was copied/);
    expect(lapsedStageCopy("epoch: draft replaced")).toMatch(/answer was dropped/);
  });
});
