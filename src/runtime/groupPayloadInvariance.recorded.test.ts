import { readFileSync } from "node:fs";
import { GROUP_PAYLOAD_GOLDEN, groupPayloadSteps } from "../../test/support/groupPayloadTurn";

describe("v2.7 plan 03: a scripted group turn sends the model the same bytes after the solo removal", () => {
  it("resting, drafted (own view, narrator view, a beat), withheld quiet run: byte-identical to the capture taken before the removal", async () => {
    const steps = await groupPayloadSteps();
    expect(Object.keys(steps.draftedNatalia).length).toBeGreaterThan(2);
    expect(steps).toEqual(JSON.parse(readFileSync(GROUP_PAYLOAD_GOLDEN, "utf8")));
  });
});
