import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow } from "@engine/index";
import { createDeliveryPort, deliveryKit } from "./deliveryPort";

const FERRY = parseStoryOrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/delivery.story.json"), "utf8")));

describe("v2.9 plan 02 S2: the delivery port loads its chunk on demand", () => {
  it("gives a draft before the chunk resolves no line, counts it, and refreshes once the chunk is in", async () => {
    let refreshed = 0;
    let resolve: () => void = () => undefined;
    const loaded = new Promise<void>((done) => { resolve = done; });
    const port = createDeliveryPort({
      story: () => FERRY, values: () => ({}), rows: () => [], switches: () => ({ enabled: true, repetition: true }),
      refresh: () => { refreshed += 1; resolve(); },
    });
    expect(deliveryKit()).toBeNull();
    expect(port.lines("tamsin")).toEqual([]);
    expect(port.earlyDrafts()).toBe(1);
    await loaded;
    expect(refreshed).toBe(1);
    expect(port.lines("tamsin").join("\n")).toContain("How you speak");
    expect(port.earlyDrafts()).toBe(1);
  });

  it("is inactive for a story with no roster, and for a member outside the roster", () => {
    const port = createDeliveryPort({ story: () => ({ ...FERRY, roster: [] }), values: () => null, rows: () => [], switches: () => ({ enabled: true, repetition: true }), refresh: () => undefined });
    expect(port.active()).toBe(false);
    expect(port.delivers("tamsin")).toBe(false);
    expect(port.lines("tamsin")).toEqual([]);
  });
});
