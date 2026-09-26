import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { judgeLegacy, legacyHits, loadLegacyBaseline, type LegacyBaseline } from "../../test/findings/legacyFree";

const ROOT = join(__dirname, "..", "..");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) ? [path] : [];
  });

const sources = (): Record<string, string> =>
  Object.fromEntries(walk(join(ROOT, "src")).map((path) => [relative(ROOT, path).replace(/\\/g, "/"), readFileSync(path, "utf8")]));

const spec = loadLegacyBaseline();

describe("v2.5 plan 11 S1: no legacy branch left in src/", () => {
  const verdict = judgeLegacy(sources(), spec);

  it("no hit outside the baseline and the C1 allowlist", () => {
    expect(verdict.unexpected).toEqual([]);
  });

  it("the baseline only shrinks: an entry that no longer matches is stale", () => {
    expect(verdict.stale).toEqual([]);
  });

  it("the C1 allowlist matches its lines exactly, with exact counts", () => {
    expect(verdict.allowlistDrift).toEqual([]);
  });

  it("a closed baseline is empty", () => {
    expect(verdict.remaining).toEqual([]);
  });

  it("the allowlist is C1 only", () => {
    expect([...new Set(spec.allowlist.map((entry) => entry.file))].sort()).toEqual(["src/services/stHost/capabilities.ts", "src/services/stHost/version.ts"]);
    expect(spec.allowlist.every((entry) => entry.reason.startsWith("C1"))).toBe(true);
  });
});

describe("control: the scan can fail", () => {
  const empty: LegacyBaseline = { closed: false, baseline: {}, allowlist: [] };

  it("a synthetic offender is caught", () => {
    const files = { "src/x.ts": "const blob = migrateLegacyBlob(value);\nif (blob.version !== 4) return;\nfindStory(idOrHash);\n" };
    expect(legacyHits(files["src/x.ts"])).toHaveLength(3);
    expect(judgeLegacy(files, empty).unexpected).toEqual(["src/x.ts: 3 hit(s), baseline 0"]);
  });

  it("a stale baseline entry is caught", () => {
    expect(judgeLegacy({ "src/x.ts": "clean" }, { ...empty, baseline: { "src/x.ts": 2 } }).stale).toHaveLength(1);
  });

  it("a third legacy line in an allowlisted file is caught, and so is a moved allowlisted line", () => {
    const allowlist = [{ file: "src/v.ts", text: "return \"legacy\";", count: 1, reason: "C1" }];
    expect(judgeLegacy({ "src/v.ts": "return \"legacy\";\nreturn \"legacy\";" }, { ...empty, allowlist }).allowlistDrift).toHaveLength(1);
    expect(judgeLegacy({ "src/v.ts": "return \"legacy\";\nconst legacyPath = 1;" }, { ...empty, allowlist }).unexpected).toHaveLength(1);
    expect(judgeLegacy({ "src/v.ts": "clean" }, { ...empty, allowlist }).allowlistDrift).toHaveLength(1);
  });

  it("a closed baseline that still names a file fails", () => {
    expect(judgeLegacy({}, { closed: true, baseline: { "src/x.ts": 1 }, allowlist: [] }).remaining).toEqual(["src/x.ts"]);
  });

  it("a clean file passes", () => {
    const verdict = judgeLegacy({ "src/x.ts": "const blob = readBlob(value);" }, empty);
    expect([verdict.unexpected, verdict.stale, verdict.allowlistDrift, verdict.remaining]).toEqual([[], [], [], []]);
  });
});
