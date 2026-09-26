import { readFileSync } from "fs";
import { join } from "path";
import * as H from "./codeHealth";

export interface CodeHealthSpec {
  budgets: { manager: number; coordinator: number; file: number; fnLines: number; fnBranches: number; fnNesting: number; lineChars: number };
  s2: string[];
  s3: string[];
  s4: { lines: string[]; branches: string[]; nesting: string[] };
  s5: Record<string, number>;
  s6: string[];
  s7: string[][];
  q3t: string[];
  s8: { helpers: string[]; withholding: Record<string, number>; fnv: string[]; popupCasts: number; duplicates: string[][]; duplicateBodyAllowlist: string[][]; dead: string[] };
  t1: { unknownCasts: Record<string, number>; nonNull: Record<string, number>; nonNullAllowlist: Array<{ key: string; count: number; reason: string }> };
  t3: Record<string, number>;
  e1: Record<string, number>;
  d1: string[];
  q1t: Record<string, number>;
}

export const HELPER_RULES: H.HelperRule[] = [
  { names: ["isRecord"], home: "src/utils/guards.ts" },
  { names: ["tokenize", "jaccard"], home: "src/memory/similarity.ts" },
  { names: ["truncate"], home: "src/utils/string.ts" },
];
export const WITHHOLDING_HOME = "src/runtime/generationLifecycle.ts";
export const FNV_HOME = "src/runtime/hash.ts";
export const POPUP_HOME = "src/services/stHost/popup.ts";
export const DEAD_EXPORT_ALLOWED = "src/engine/schema.ts";
export const MODEL_CALL_ALLOWED = [
  "src/extraction/client.ts",
  "src/runtime/modelCall.ts",
  "src/runtime/selfTest.ts",
  "src/runtime/liveSuite.ts",
  "src/runtime/roleSelfTest.ts",
  "src/runtime/roleCalibration.ts",
  "src/services/",
];
export const TEST_SUPPORT = (path: string): boolean =>
  /^test\//.test(path) || ["src/engine/replay.ts", "src/utils/fakeDocument.ts", "src/studio/stories/fixtures.ts"].includes(path);

export interface Scan {
  files: string[];
  read: (path: string) => string;
  entry: string;
  corpus: string[];
  tests: string[];
  tsconfig: string | null;
  budgets: CodeHealthSpec["budgets"];
}

export const liveScan = (budgets: CodeHealthSpec["budgets"]): Scan => {
  const cache = new Map<string, string>();
  const read = (path: string) => {
    if (!cache.has(path)) cache.set(path, readFileSync(path, "utf8"));
    return cache.get(path) as string;
  };
  return {
    files: H.prodFiles(),
    read,
    entry: join(H.SRC, "index.tsx"),
    corpus: [...H.sourceFiles(H.SRC), ...H.sourceFiles(join(H.ROOT, "scripts")), ...H.sourceFiles(join(H.ROOT, "test"))],
    tests: H.sourceFiles(H.SRC).filter((path) => /\.test\.tsx?$/.test(path)),
    tsconfig: join(H.ROOT, "tsconfig.json"),
    budgets,
  };
};

const isCoordinator = (path: string) => /^src\/runtime\/coordinators\//.test(H.rel(path));
const isManager = (path: string) => H.rel(path) === "src/runtime/runtimeManager.ts";

export const measureS2 = (scan: Scan): string[] =>
  scan.files.filter((path) => (isManager(path) && H.effectiveLines(scan.read(path)) > scan.budgets.manager) ||
    (isCoordinator(path) && H.effectiveLines(scan.read(path)) > scan.budgets.coordinator)).map(H.rel).sort();

export const measureS3 = (scan: Scan): string[] =>
  scan.files.filter((path) => H.effectiveLines(scan.read(path)) > scan.budgets.file).map(H.rel).sort();

export const measureS4 = (scan: Scan): CodeHealthSpec["s4"] => {
  const metrics = scan.files.flatMap((path) => H.functionMetrics(path, scan.read(path)));
  const key = (metric: H.FunctionMetric) => `${metric.file}#${metric.name}`;
  return {
    lines: metrics.filter((metric) => metric.lines > scan.budgets.fnLines).map(key).sort(),
    branches: metrics.filter((metric) => metric.branches > scan.budgets.fnBranches).map(key).sort(),
    nesting: metrics.filter((metric) => metric.nesting > scan.budgets.fnNesting).map(key).sort(),
  };
};

export const measureS5 = (scan: Scan): Record<string, number> =>
  H.countBy(scan.files.flatMap((path) => H.longLines(path, scan.budgets.lineChars, scan.read(path))), (line) => line.file);

export const measureS6 = (scan: Scan): string[] => {
  const graph = H.buildGraph(scan.files, { includeDynamic: false }, scan.read);
  const isHost = (path: string) => H.rel(path).startsWith("src/services/");
  return scan.files.filter(isCoordinator).flatMap((path) => H.hostReach(graph, path, isHost).map((hop) => `${H.rel(path)} -> ${hop}`)).sort();
};

const STAPI_MOCK = /jest\.mock\(\s*["']@services\/STAPI["']/;

export const measureS6t = (scan: Scan): string[] =>
  scan.tests.filter((path) => /^src\/runtime\/coordinators\//.test(H.rel(path)) && STAPI_MOCK.test(scan.read(path))).map(H.rel).sort();

export const measureS7 = (scan: Scan): string[][] => H.stronglyConnected(H.buildGraph(scan.files, { includeDynamic: false }, scan.read));

export const measureQ3t = (scan: Scan): string[] => {
  const graph = H.buildGraph(scan.files, { includeDynamic: true }, scan.read);
  return [...H.reachableFrom(graph, scan.entry, scan.read)].map(H.rel).filter(TEST_SUPPORT).sort();
};

export const measureS8 = (scan: Scan, allowlist: string[][] = []): Omit<CodeHealthSpec["s8"], "duplicateBodyAllowlist"> => {
  const allowed = new Set(allowlist.map((group) => [...group].sort().join("|")));
  const popup = scan.files.find((path) => H.rel(path) === POPUP_HOME);
  return {
    helpers: H.helpersOutsideHome(scan.files, HELPER_RULES, scan.read),
    withholding: H.countBy(H.withholdingSites(scan.files, WITHHOLDING_HOME, scan.read), (site) => site),
    fnv: H.fnvSites(scan.files, FNV_HOME, scan.read),
    popupCasts: popup ? H.nodeSites(popup, H.isUnknownDoubleCast, scan.read(popup)).length : 0,
    duplicates: H.duplicateBodies(scan.files, scan.read).filter((group) => !allowed.has(group.join("|"))),
    dead: H.deadExports(scan.files, scan.corpus, scan.read).filter((symbol) => symbol.file !== DEAD_EXPORT_ALLOWED).map((symbol) => `${symbol.file}#${symbol.name}`).sort(),
  };
};

export const measureT1 = (scan: Scan): Pick<CodeHealthSpec["t1"], "unknownCasts" | "nonNull"> => ({
  unknownCasts: H.countBy(scan.files.filter((path) => !H.rel(path).startsWith("src/services/stHost/")).flatMap((path) => H.nodeSites(path, H.isUnknownDoubleCast, scan.read(path))), (site) => site.file),
  nonNull: H.countBy(scan.files.flatMap((path) => H.nodeSites(path, H.isNonNull, scan.read(path))), (site) => site.file),
});

export const measureT3 = (scan: Scan): Record<string, number> => {
  const lines = scan.files.flatMap((path) => H.citationComments(path, scan.read(path)));
  const config = scan.tsconfig ? H.jsonCommentLines(scan.tsconfig, scan.read(scan.tsconfig)).filter((line) => H.citationOffends(line.text)) : [];
  return H.countBy([...lines, ...config], (line) => line.file);
};

export const measureE1 = (scan: Scan): Record<string, number> =>
  H.countBy(scan.files.filter((path) => H.rel(path) !== "src/utils/log.ts").flatMap((path) => H.nodeSites(path, H.isConsoleCall, scan.read(path))), (site) => site.file);

export const measureD1 = (scan: Scan): string[] => H.modelCallSites(scan.files, MODEL_CALL_ALLOWED, scan.read);

export const measureQ1t = (scan: Scan): Record<string, number> =>
  H.countBy(scan.tests.flatMap((path) => H.timingOffenders(path, scan.read(path))), (key) => key);

export const measureAll = (scan: Scan, spec?: CodeHealthSpec): Omit<CodeHealthSpec, "budgets"> => {
  const s8 = measureS8(scan, spec?.s8?.duplicateBodyAllowlist ?? []);
  return {
    s2: measureS2(scan),
    s3: measureS3(scan),
    s4: measureS4(scan),
    s5: measureS5(scan),
    s6: measureS6(scan),
    s7: measureS7(scan),
    q3t: measureQ3t(scan),
    s8: { ...s8, duplicateBodyAllowlist: spec?.s8?.duplicateBodyAllowlist ?? [] },
    t1: { ...measureT1(scan), nonNullAllowlist: spec?.t1?.nonNullAllowlist ?? [] },
    t3: measureT3(scan),
    e1: measureE1(scan),
    d1: measureD1(scan),
    q1t: measureQ1t(scan),
  };
};
