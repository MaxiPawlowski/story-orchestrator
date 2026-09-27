jest.mock("@services/STAPI", () => ({ loadLorebook: jest.fn(), profileExists: () => true }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSharedReadResponse } from "@extraction/index";
import { buildFixtureRun } from "@extraction/fixtureRun";
import { liveReadTiers } from "./liveSuite";

const fixture = (name: string, part: string) => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures", `${name}.${part}.json`), "utf8"));

const LIVE_EXTRACTOR27 = [
  'DELTA lantern_broken=true evidence="The signal lantern is dark, its glass shattered."',
  "[state:Signal Lantern:object] status=broken | glass=shattered | light=dark",
].join("\n");

describe("the live-suite handle hands the scorer every field the read parsed (v2.5 batch 2, F2)", () => {
  const run = buildFixtureRun({ story: fixture("extractor27", "story"), transcript: fixture("extractor27", "transcript"), epistemicLedgerCapable: true });
  const parsed = parseSharedReadResponse(LIVE_EXTRACTOR27, run.story);
  const tiers = liveReadTiers(parsed);

  it("keeps a ledger row's entity type, which extractor27's fixture requires", () => {
    expect(parsed.ledger.length).toBeGreaterThan(0);
    expect(tiers.ledger[0]).toMatchObject({ entity: "Signal Lantern", entityType: "object", field: "status", value: "broken" });
    const expected = fixture("extractor27", "expected").ledger.mustContain as string[];
    const haystack = JSON.stringify(tiers.ledger).toLowerCase();
    expect(expected.filter((needle) => !haystack.includes(needle.toLowerCase()))).toEqual([]);
  });

  it("drops no parsed ledger field", () => {
    tiers.ledger.forEach((row, index) => expect(Object.keys(row).sort()).toEqual(Object.keys(parsed.ledger[index]).sort()));
  });
});
