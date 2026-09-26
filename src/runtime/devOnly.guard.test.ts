import { join } from "path";
import { SRC, buildGraph, prodFiles, reachableFrom, rel } from "../../test/support/codeHealth";

const DEV_ONLY = [
  "src/runtime/liveSuite.ts",
  "src/runtime/judgeHarness.ts",
  "src/runtime/roleCalibration.ts",
  "src/stagecraft/createCandidate.ts",
  "src/judge/calibration.ts",
  "src/judge/selfTestCases.ts",
  "src/runtime/spikes/index.ts",
  "src/runtime/spikes/recommitEdit.ts",
];
const DEV_ONLY_PATTERN = /^src\/judge\/\w+Calibration\.ts$/;
const LAZY_USER_FEATURES = ["src/judge/selfTest.ts", "src/runtime/selfTest.ts", "src/runtime/roleSelfTest.ts", "src/extraction/fixtureRun.ts"];

const isDevOnly = (path: string) => DEV_ONLY.includes(path) || DEV_ONLY_PATTERN.test(path);
const ENTRY = join(SRC, "index.tsx");

const staticReach = (files: string[], read?: (path: string) => string) =>
  [...reachableFrom(buildGraph(files, { includeDynamic: false }, read), ENTRY, read)].map(rel);

describe("dev-only modules stay out of the prod entry graph (v2.5 plan 12 D3)", () => {
  const files = prodFiles();

  it("no dev-only module is statically reachable from src/index.tsx", () => {
    expect(staticReach(files).filter(isDevOnly)).toEqual([]);
  });

  it("the self-tests the settings panel runs load lazily, not with the entry", () => {
    expect(staticReach(files).filter((path) => LAZY_USER_FEATURES.includes(path))).toEqual([]);
  });

  it("every listed dev-only module exists, so the list cannot rot into a vacuous pass", () => {
    const present = new Set(files.map(rel));
    expect(DEV_ONLY.filter((path) => !present.has(path))).toEqual([]);
    expect(files.map(rel).filter((path) => DEV_ONLY_PATTERN.test(path)).length).toBeGreaterThanOrEqual(6);
  });

  it("control: a planted static import of the live suite from the entry fails", () => {
    const planted = join(SRC, "index.tsx");
    const read = (path: string) => (path === planted ? 'import { registerLiveSuite } from "./runtime/liveSuite";\nregisterLiveSuite();\n' : require("fs").readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toContain("src/runtime/liveSuite.ts");
  });

  it("control: a planted static import of a plan 09 spike module from the runtime fails", () => {
    const runtime = join(SRC, "runtime", "index.ts");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === runtime ? `import { installSpikes } from "./spikes";\nvoid installSpikes;\n${fs.readFileSync(path, "utf8")}` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toEqual(expect.arrayContaining(["src/runtime/spikes/index.ts", "src/runtime/spikes/recommitEdit.ts"]));
  });

  it("control: re-exporting the calibrations from the judge barrel again fails", () => {
    const barrel = join(SRC, "judge", "index.ts");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === barrel ? `${fs.readFileSync(path, "utf8")}\nexport * from "./sceneCalibration";\n` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toContain("src/judge/sceneCalibration.ts");
  });
});
