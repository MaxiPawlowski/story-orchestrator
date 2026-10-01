import { join } from "path";
import { SRC, buildGraph, prodFiles, reachableFrom, rel } from "../../test/support/codeHealth";

const PLAN_09_SPIKES = ["src/memory/shortTermAppend.ts", "src/stagecraft/curatorTiers.ts", "src/stagecraft/curatorDigest.ts"];

const DEV_ONLY = [
  "src/runtime/liveSuite.ts",
  "src/runtime/judgeHarness.ts",
  "src/runtime/roleCalibration.ts",
  "src/stagecraft/createCandidate.ts",
  "src/judge/calibration.ts",
  "src/judge/selfTestCases.ts",
  "src/services/stHost/chatScenario.ts",
  ...PLAN_09_SPIKES,
];
const DEV_ONLY_PATTERN = /^src\/judge\/\w+Calibration\.ts$/;
const SPIKES = [
  "src/runtime/spikes/index.ts",
  "src/runtime/spikes/install.ts",
  "src/runtime/spikes/reasoningEffect.ts",
  "src/runtime/spikes/reasoningEffectHost.ts",
  "src/runtime/spikes/sp5Scenario.ts",
  "src/runtime/spikes/sp5ScenarioHost.ts",
  "src/runtime/spikes/sp6Complications.ts",
  "src/runtime/spikes/swipeBack.ts",
  "src/runtime/spikes/swipeCache.ts",
  "src/runtime/spikes/toolTurnProbe.ts",
  "src/runtime/spikes/toolTurnSummary.ts",
];
const SPIKE_PATTERN = /^src\/runtime\/spikes\//;
const DROPPED_SPIKES = ["src/runtime/spikes/recommitEdit.ts", "src/runtime/spikes/witnessFilter.ts", "src/runtime/spikes/witnessFilterHost.ts", "src/runtime/wiring/spikes.ts"];
const LAZY_USER_FEATURES = ["src/judge/selfTest.ts", "src/runtime/selfTest.ts", "src/runtime/roleSelfTest.ts", "src/extraction/fixtureRun.ts"];

const isDevOnly = (path: string) => DEV_ONLY.includes(path) || DEV_ONLY_PATTERN.test(path) || SPIKE_PATTERN.test(path);
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

  it("plan 09 spike modules load only behind their own flag, never with the entry (rule 2)", () => {
    expect(staticReach(files).filter((path) => PLAN_09_SPIKES.includes(path))).toEqual([]);
    const present = new Set(files.map(rel));
    expect(PLAN_09_SPIKES.filter((path) => !present.has(path))).toEqual([]);
  });

  it("control: a planted static import of a spike module fails", () => {
    const store = join(SRC, "memory", "index.ts");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === store ? `${fs.readFileSync(path, "utf8")}\nexport * from "./shortTermAppend";\n` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter((path) => PLAN_09_SPIKES.includes(path))).toContain("src/memory/shortTermAppend.ts");
  });

  it("every listed dev-only module exists, so the list cannot rot into a vacuous pass", () => {
    const present = new Set(files.map(rel));
    expect(DEV_ONLY.filter((path) => !present.has(path))).toEqual([]);
    expect(files.map(rel).filter((path) => DEV_ONLY_PATTERN.test(path)).length).toBeGreaterThanOrEqual(6);
    expect(SPIKES.filter((path) => !present.has(path))).toEqual([]);
    expect(files.map(rel).filter((path) => SPIKE_PATTERN.test(path)).sort()).toEqual([...SPIKES].sort());
  });

  it.each([
    ["the SP10 probe", 'export { createToolTurnProbe } from "./runtime/spikes/toolTurnProbe";', "src/runtime/spikes/toolTurnProbe.ts"],
    ["the R4 reasoning effect host", 'export { startReasoningEffect } from "./runtime/spikes/reasoningEffectHost";', "src/runtime/spikes/reasoningEffectHost.ts"],
    ["the R4 pure reasoning effect", 'import "./runtime/spikes/reasoningEffect";', "src/runtime/spikes/reasoningEffect.ts"],
  ])("control: a planted static import of %s from the entry fails", (_label, line, module) => {
    const planted = join(SRC, "index.tsx");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === planted ? `${fs.readFileSync(path, "utf8")}\n${line}\n` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toContain(module);
  });

  it("control: a planted static import of a plan-09 spike module from the entry fails", () => {
    const planted = join(SRC, "index.tsx");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === planted ? `${fs.readFileSync(path, "utf8")}\nimport { registerScenarioSpike } from "./runtime/spikes/sp5ScenarioHost";\nregisterScenarioSpike();\n` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toEqual(expect.arrayContaining(["src/runtime/spikes/sp5ScenarioHost.ts", "src/runtime/spikes/sp5Scenario.ts", "src/services/stHost/chatScenario.ts"]));
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
    expect(staticReach(files, read).filter(isDevOnly)).toEqual(expect.arrayContaining(["src/runtime/spikes/index.ts", "src/runtime/spikes/swipeBack.ts", "src/runtime/spikes/swipeCache.ts"]));
  });

  it("control: re-exporting the calibrations from the judge barrel again fails", () => {
    const barrel = join(SRC, "judge", "index.ts");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === barrel ? `${fs.readFileSync(path, "utf8")}\nexport * from "./sceneCalibration";\n` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toContain("src/judge/sceneCalibration.ts");
  });

  it("v2.6 plan 03: a dropped spike's modules are gone from the source tree", () => {
    const present = new Set(files.map(rel));
    expect(DROPPED_SPIKES.filter((path) => present.has(path))).toEqual([]);
  });

  it("control: a planted static import of a dropped spike reaches no module", () => {
    const planted = join(SRC, "index.tsx");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === planted ? `${fs.readFileSync(path, "utf8")}
import "./runtime/spikes/recommitEdit";
import "./runtime/spikes/witnessFilter";
import "./runtime/spikes/witnessFilterHost";
import "./runtime/wiring/spikes";
` : fs.readFileSync(path, "utf8"));
    const reached = staticReach(files, read);
    expect(reached.filter((path) => DROPPED_SPIKES.includes(path))).toEqual([]);
    expect(reached.length).toBe(staticReach(files).length);
  });

  it("control: a planted static import of a plan-09 spike module fails (v2.5 plan 09 rule 2)", () => {
    const planted = join(SRC, "runtime", "index.ts");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === planted ? `import { installSpikes } from "./spikes/install";\n${fs.readFileSync(path, "utf8")}` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toEqual(expect.arrayContaining(["src/runtime/spikes/install.ts", "src/runtime/spikes/sp6Complications.ts"]));
  });

  it("SP7.b: the seeded chance seam ships in the prod entry graph, and its spike module is gone", () => {
    expect(staticReach(files)).toEqual(expect.arrayContaining(["src/engine/chance.ts", "src/runtime/chance.ts"]));
    expect(files.map(rel)).not.toContain("src/runtime/spikes/sp7Chance.ts");
  });
});
