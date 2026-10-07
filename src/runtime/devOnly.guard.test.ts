import { join } from "path";
import { SRC, buildGraph, prodFiles, reachableFrom, rel } from "../../test/support/codeHealth";

const DEV_ONLY = [
  "src/runtime/liveSuite.ts",
  "src/runtime/judgeHarness.ts",
  "src/runtime/roleCalibration.ts",
  "src/stagecraft/createCandidate.ts",
  "src/judge/calibration.ts",
  "src/judge/selfTestCases.ts",
  "src/runtime/agendaProposalsDev.ts",
  "src/runtime/coordinators/agendaProposalCoordinator.ts",
  "src/runtime/meanwhilePrompt.ts",
];
const DEV_ONLY_PATTERN = /^src\/judge\/\w+Calibration\.ts$/;
const SPIKES = [
  "src/runtime/spikes/editReread.ts",
  "src/runtime/spikes/editRereadHost.ts",
  "src/runtime/spikes/index.ts",
  "src/runtime/spikes/install.ts",
  "src/runtime/spikes/sp6Complications.ts",
  "src/runtime/spikes/swipeBack.ts",
  "src/runtime/spikes/swipeCache.ts",
];
const SPIKE_PATTERN = /^src\/runtime\/spikes\//;
const DROPPED_SPIKES = [
  "src/runtime/spikes/recommitEdit.ts", "src/runtime/spikes/witnessFilter.ts", "src/runtime/spikes/witnessFilterHost.ts", "src/runtime/wiring/spikes.ts",
  "src/stagecraft/curatorDigest.ts", "src/memory/shortTermAppend.ts",
  "src/runtime/spikes/toolTurnProbe.ts", "src/runtime/spikes/toolTurnSummary.ts",
];
const LAZY_USER_FEATURES = ["src/judge/selfTest.ts", "src/runtime/selfTest.ts", "src/runtime/roleSelfTest.ts", "src/extraction/fixtureRun.ts"];
const LAZY_SHIPPED = ["src/runtime/replyEffort.ts", "src/runtime/replyEffortHost.ts", "src/runtime/replyEffortLive.ts", "src/services/stHost/llamaCpp.ts", "src/utils/replyEffort.ts"];

const WARM_BATCH = ["src/sprites/builder/batchHost.ts", "src/sprites/builder/batchLease.ts"];

const isDevOnly =(path: string) => DEV_ONLY.includes(path) || DEV_ONLY_PATTERN.test(path) || SPIKE_PATTERN.test(path);
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

  it("the reply effort overlay ships but loads as its own chunk, never with the entry", () => {
    const present = new Set(files.map(rel));
    expect(LAZY_SHIPPED.filter((path) => !present.has(path))).toEqual([]);
    expect(staticReach(files).filter((path) => LAZY_SHIPPED.includes(path))).toEqual([]);
    expect(LAZY_SHIPPED.filter(isDevOnly)).toEqual([]);
  });

  it("control: a planted static import of the reply effort host from the entry is reached", () => {
    const planted = join(SRC, "index.tsx");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === planted ? `${fs.readFileSync(path, "utf8")}
export { startLiveReplyEffort } from "./runtime/replyEffortLive";
` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter((path) => LAZY_SHIPPED.includes(path))).toEqual(expect.arrayContaining(LAZY_SHIPPED));
  });

  it("control: a planted static import of a spike module from the stagecraft barrel fails", () => {
    const store = join(SRC, "stagecraft", "index.ts");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === store ? `${fs.readFileSync(path, "utf8")}\nexport * from "../runtime/spikes/swipeBack";\n` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toContain("src/runtime/spikes/swipeBack.ts");
  });

  it("every listed dev-only module exists, so the list cannot rot into a vacuous pass", () => {
    const present = new Set(files.map(rel));
    expect(DEV_ONLY.filter((path) => !present.has(path))).toEqual([]);
    expect(files.map(rel).filter((path) => DEV_ONLY_PATTERN.test(path)).length).toBeGreaterThanOrEqual(6);
    expect(SPIKES.filter((path) => !present.has(path))).toEqual([]);
    expect(files.map(rel).filter((path) => SPIKE_PATTERN.test(path)).sort()).toEqual([...SPIKES].sort());
  });

  it("control: a planted static import of a plan-09 spike module from the entry fails", () => {
    const planted = join(SRC, "index.tsx");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === planted ? `${fs.readFileSync(path, "utf8")}\nimport { SwipeBack } from "./runtime/spikes/swipeBack";\nvoid SwipeBack;\n` : fs.readFileSync(path, "utf8"));
    expect(staticReach(files, read).filter(isDevOnly)).toEqual(expect.arrayContaining(["src/runtime/spikes/swipeBack.ts", "src/runtime/spikes/swipeCache.ts"]));
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
import "./stagecraft/curatorDigest";
import "./memory/shortTermAppend";
import "./runtime/spikes/toolTurnProbe";
import "./runtime/spikes/toolTurnSummary";
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

  it("SP5.b (v2.7 02 C1): the story scenario ships in the prod entry graph, and its spike modules are gone", () => {
    expect(staticReach(files)).toEqual(expect.arrayContaining(["src/runtime/storyScenario.ts", "src/runtime/storyScenarioHost.ts", "src/services/stHost/chatScenario.ts"]));
    expect(files.map(rel).filter((path) => /spikes\/sp5/.test(path))).toEqual([]);
  });

  it("SP8.b (v2.7 02 C13): the curator tiers ship in the prod entry graph, through the stagecraft barrel, and are not dev-only", () => {
    expect(staticReach(files)).toContain("src/stagecraft/curatorTiers.ts");
    expect(isDevOnly("src/stagecraft/curatorTiers.ts")).toBe(false);
  });

  it("v2.7 31 §B: the warm-batch lease is reached only through a dynamic import, never statically from the sprites chunk", () => {
    const sprites = join(SRC, "sprites", "start.tsx");
    const present = new Set(files.map(rel));
    expect(WARM_BATCH.filter((path) => !present.has(path))).toEqual([]);
    const fromSprites = [...reachableFrom(buildGraph(files, { includeDynamic: false }), sprites)].map(rel);
    expect(fromSprites.filter((path) => WARM_BATCH.includes(path))).toEqual([]);
    const staticImporters = [...buildGraph(files, { includeDynamic: false }).entries()]
      .filter(([from, targets]) => !WARM_BATCH.includes(rel(from)) && targets.some((target) => WARM_BATCH.includes(rel(target)))).map(([from]) => rel(from));
    expect(staticImporters).toEqual([]);
    expect(staticReach(files).filter((path) => WARM_BATCH.includes(path))).toEqual([]);
    expect([...reachableFrom(buildGraph(files, { includeDynamic: true }), sprites)].map(rel)).toEqual(expect.arrayContaining(WARM_BATCH));
  });

  it("control: a planted static import of the warm-batch host in the sprites start is reached", () => {
    const sprites = join(SRC, "sprites", "start.tsx");
    const fs = require("fs") as typeof import("fs");
    const read = (path: string) => (path === sprites ? `import { beginSpriteBatch } from "./builder/batchHost";\nvoid beginSpriteBatch;\n${fs.readFileSync(path, "utf8")}` : fs.readFileSync(path, "utf8"));
    expect([...reachableFrom(buildGraph(files, { includeDynamic: false }, read), sprites, read)].map(rel)).toEqual(expect.arrayContaining(WARM_BATCH));
  });

  it("SP7.b: the seeded chance seam ships in the prod entry graph, and its spike module is gone", () => {
    expect(staticReach(files)).toEqual(expect.arrayContaining(["src/engine/chance.ts", "src/runtime/chance.ts"]));
    expect(files.map(rel)).not.toContain("src/runtime/spikes/sp7Chance.ts");
  });
});
