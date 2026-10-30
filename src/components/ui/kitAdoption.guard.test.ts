import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { ROOT, SRC, rel, ratchetCounts } from "../../../test/support/codeHealth";

const LISTED = JSON.parse(readFileSync(join(ROOT, "test/findings/rawButtons.json"), "utf8")) as Record<string, number>;
const RAW = /(?<![\w-])(?:menu_button|st-button)(?![\w-])/g;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

const rawButtonCounts = (files: Record<string, string>): Record<string, number> =>
  Object.fromEntries(Object.entries(files).flatMap(([path, text]) => {
    const count = text.match(RAW)?.length ?? 0;
    return count ? [[path, count]] : [];
  }));

const live = () => Object.fromEntries(walk(SRC)
  .filter((path) => path.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(path))
  .map((path) => [rel(path), readFileSync(path, "utf8")]));

describe("v3.0 29 phase 1: new UI uses the kit, not raw ST/legacy button classes", () => {
  it("no file adds a raw menu_button/st-button beyond test/findings/rawButtons.json, and the list shrinks as callers move to the kit", () => {
    expect(ratchetCounts(rawButtonCounts(live()), LISTED)).toEqual({ unexpected: [], stale: [] });
  });

  it("controls: a new file with a raw button is caught, a kit Button is not, a migrated file reads stale", () => {
    const counts = rawButtonCounts({
      "src/components/new/A.tsx": '<button className="menu_button">x</button><button className="st-button secondary">y</button>',
      "src/components/new/B.tsx": '<Button variant="primary">x</Button><span className="so-menu_button-ish" />',
    });
    expect(counts).toEqual({ "src/components/new/A.tsx": 2 });
    expect(ratchetCounts(counts, {}).unexpected).toEqual(["src/components/new/A.tsx: 2, listed 0"]);
    expect(ratchetCounts({}, { "src/components/old/C.tsx": 3 }).stale).toEqual(["src/components/old/C.tsx: listed 3, now 0 (shrink the list)"]);
  });
});
