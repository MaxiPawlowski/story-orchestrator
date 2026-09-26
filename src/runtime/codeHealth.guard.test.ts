import { readFileSync } from "fs";
import { join } from "path";
import { ROOT, SRC, ratchetCounts, ratchetSet, type Ratchet } from "../../test/support/codeHealth";
import {
  liveScan, measureD1, measureE1, measureQ1t, measureQ3t, measureS2, measureS3, measureS4, measureS5, measureS6, measureS7, measureS8, measureT1, measureT3,
  type CodeHealthSpec, type Scan,
} from "../../test/support/codeHealthScan";

const spec = JSON.parse(readFileSync(join(ROOT, "test/findings/codeHealth.json"), "utf8")) as CodeHealthSpec & { closed: boolean };
const scan = liveScan(spec.budgets);
const clean: Ratchet = { unexpected: [], stale: [] };
const groupKeys = (groups: string[][]) => groups.map((group) => group.join(" | "));

const planted = (files: Record<string, string>, extra: Partial<Scan> = {}): Scan => {
  const paths = Object.fromEntries(Object.entries(files).map(([path, text]) => [join(ROOT, path), text]));
  const list = Object.keys(paths);
  return {
    files: list,
    read: (path) => paths[path] ?? "",
    entry: list[0],
    corpus: list,
    tests: list.filter((path) => /\.test\.ts$/.test(path)),
    tsconfig: null,
    budgets: spec.budgets,
    ...extra,
  };
};
const lines = (count: number, width = 20) => Array.from({ length: count }, (_, index) => `const v${index} = "${"x".repeat(width)}";`).join("\n");

describe("code health ratchets (v2.5 plan 03 D0)", () => {
  it("S2: the manager and coordinator offenders equal the list", () => {
    expect(ratchetSet(measureS2(scan), spec.s2)).toEqual(clean);
  });

  it("S2 control: a planted 561-line coordinator and a 701-line manager fail", () => {
    const result = measureS2(planted({ "src/runtime/coordinators/planted.ts": lines(561), "src/runtime/runtimeManager.ts": lines(701), "src/runtime/coordinators/fine.ts": lines(560) }));
    expect(result).toEqual(["src/runtime/coordinators/planted.ts", "src/runtime/runtimeManager.ts"]);
  });

  it("S3: prod files over the file budget equal the list", () => {
    expect(ratchetSet(measureS3(scan), spec.s3)).toEqual(clean);
    expect(ratchetSet(measureS3(planted({ "src/a.ts": lines(601), "src/b.ts": lines(600) })), [])).toEqual({ unexpected: ["src/a.ts: 1, listed 0"], stale: [] });
  });

  it("S4: long, branchy and deep functions equal the lists", () => {
    const measured = measureS4(scan);
    expect(ratchetSet(measured.lines, spec.s4.lines)).toEqual(clean);
    expect(ratchetSet(measured.branches, spec.s4.branches)).toEqual(clean);
    expect(ratchetSet(measured.nesting, spec.s4.nesting)).toEqual(clean);
  });

  it("S4 control: a 151-line function, a 41-branch function and nesting 6 fail", () => {
    const body151 = `function long() {\n${Array.from({ length: 149 }, (_, index) => `  call(${index});`).join("\n")}\n}`;
    const branchy = `function branchy(a: number) {\n  return ${Array.from({ length: 42 }, (_, index) => `a === ${index}`).join(" || ")};\n}`;
    const deep = "function deep(a: number) {\n  if (a) { if (a) { if (a) { if (a) { if (a) { if (a) { call(); } } } } } }\n}";
    const result = measureS4(planted({ "src/p.ts": [body151, branchy, deep].join("\n") }));
    expect(result).toEqual({ lines: ["src/p.ts#long"], branches: ["src/p.ts#branchy"], nesting: ["src/p.ts#deep"] });
  });

  it("S5: lines over the character budget equal the per-file counts", () => {
    expect(ratchetCounts(measureS5(scan), spec.s5)).toEqual(clean);
    expect(measureS5(planted({ "src/p.ts": `const a = "${"x".repeat(190)}";\nconst b = 1;` }))).toEqual({ "src/p.ts": 1 });
  });

  it("S6: coordinators reaching the host through a value import equal the list", () => {
    expect(ratchetSet(measureS6(scan), spec.s6)).toEqual(clean);
  });

  it("S6 control: a coordinator reaching STAPI through a helper fails; a type-only import passes", () => {
    const result = measureS6(planted({
      "src/runtime/coordinators/planted.ts": 'import { helper } from "../helper";\nexport const x = helper;',
      "src/runtime/helper.ts": 'import { thing } from "@services/STAPI";\nexport const helper = thing;',
      "src/runtime/coordinators/typed.ts": 'import type { Thing } from "@services/STAPI";\nexport type X = Thing;',
    }));
    expect(result).toEqual(["src/runtime/coordinators/planted.ts -> src/runtime/helper.ts"]);
  });

  it("S7: import cycles equal the list", () => {
    expect(ratchetSet(groupKeys(measureS7(scan)), groupKeys(spec.s7))).toEqual(clean);
    expect(groupKeys(measureS7(planted({ "src/a.ts": 'import { b } from "./b";\nexport const a = b;', "src/b.ts": 'import { a } from "./a";\nexport const b = a;' })))).toEqual(["src/a.ts | src/b.ts"]);
  });

  it("Q3t: test-only modules reachable from the entry equal the list", () => {
    expect(ratchetSet(measureQ3t(scan), spec.q3t)).toEqual(clean);
    const control = planted({ "src/index.tsx": 'import { r } from "./engine/replay";\nexport const x = r;', "src/engine/replay.ts": "export const r = 1;" });
    expect(measureQ3t({ ...control, entry: join(SRC, "index.tsx") })).toEqual(["src/engine/replay.ts"]);
  });

  it("S8: helpers, withholding copies, FNV copies, popup casts, duplicate bodies and dead exports equal the lists", () => {
    const measured = measureS8(scan, spec.s8.duplicateBodyAllowlist);
    expect(ratchetSet(measured.helpers, spec.s8.helpers)).toEqual(clean);
    expect(ratchetCounts(measured.withholding, spec.s8.withholding)).toEqual(clean);
    expect(ratchetSet(measured.fnv, spec.s8.fnv)).toEqual(clean);
    expect(ratchetCounts({ popup: measured.popupCasts }, { popup: spec.s8.popupCasts })).toEqual(clean);
    expect(ratchetSet(groupKeys(measured.duplicates), groupKeys(spec.s8.duplicates))).toEqual(clean);
    expect(ratchetSet(measured.dead, spec.s8.dead)).toEqual(clean);
  });

  it("S8 control: a redeclared isRecord, a quiet/impersonate set, a duplicate body and a dead export fail", () => {
    const body = "{\n  const a = 1;\n  const b = 2;\n  return a + b;\n}";
    const result = measureS8(planted({
      "src/p.ts": `export const isRecord = (v: unknown) => !!v;\nconst withheld = new Set(["quiet", "impersonate"]);\nexport function one() ${body}\nexport function two() ${body}\nexport const unused = withheld;`,
      "src/q.ts": 'import { isRecord, one, two } from "./p";\nexport const used = [isRecord, one, two];',
    }));
    expect(result.helpers).toEqual(["src/p.ts#isRecord"]);
    expect(result.withholding).toEqual({ "src/p.ts#set": 1 });
    expect(result.duplicates).toEqual([["src/p.ts#one", "src/p.ts#two"]]);
    expect(result.dead).toEqual(["src/p.ts#unused", "src/q.ts#used"]);
  });

  it("T1: casts through unknown outside stHost and non-null assertions equal the lists", () => {
    const measured = measureT1(scan);
    const allowed = Object.fromEntries(spec.t1.nonNullAllowlist.map((entry) => [entry.key, entry.count]));
    expect(spec.t1.nonNullAllowlist.length).toBeLessThanOrEqual(5);
    expect(ratchetCounts(measured.unknownCasts, spec.t1.unknownCasts)).toEqual(clean);
    expect(ratchetCounts(measured.nonNull, { ...spec.t1.nonNull, ...Object.fromEntries(Object.entries(allowed).map(([key, count]) => [key, (spec.t1.nonNull[key] ?? 0) + count])) })).toEqual(clean);
    const control = measureT1(planted({ "src/p.ts": "export const a = (x as unknown as number);\nexport const b = (y!);", "src/services/stHost/h.ts": "export const c = (x as unknown as number);" }));
    expect(control).toEqual({ unknownCasts: { "src/p.ts": 1 }, nonNull: { "src/p.ts": 1 } });
  });

  it("T3: comment lines citing plans, versions, ticket ids or dates equal the per-file counts", () => {
    expect(ratchetCounts(measureT3(scan), spec.t3)).toEqual(clean);
  });

  it("T3 control: a planted plan citation fails, a host-fact file:line citation and stHost JSDoc pass", () => {
    const result = measureT3(planted({
      "src/p.ts": "// plan 99 added this\nexport const a = 1;\n// ST binds the save late, script.js:1590\nexport const b = 2;",
      "src/services/stHost/h.ts": "/** Mirrors v2.4 plan 05's host read. */\nexport const c = 3;",
    }));
    expect(result).toEqual({ "src/p.ts": 1 });
  });

  it("E1: direct console calls equal the per-file counts", () => {
    expect(ratchetCounts(measureE1(scan), spec.e1)).toEqual(clean);
    expect(measureE1(planted({ "src/p.ts": 'console.warn("x");', "src/utils/log.ts": 'console.warn("y");' }))).toEqual({ "src/p.ts": 1 });
  });

  it("D1: model-call entry points referenced outside the one surface equal the list", () => {
    expect(ratchetSet(measureD1(scan), spec.d1)).toEqual(clean);
    expect(measureD1(planted({ "src/runtime/coordinators/p.ts": 'import { callExtractionModel } from "@extraction/client";\nexport const a = callExtractionModel;', "src/extraction/client.ts": "export function callExtractionModel() {}" }))).toEqual(["src/runtime/coordinators/p.ts"]);
  });

  it("Q1t: wall-clock reads and real sleeps over 50 ms in jest equal the list", () => {
    expect(ratchetCounts(measureQ1t(scan), spec.q1t)).toEqual(clean);
    const control = measureQ1t(planted({ "src/p.test.ts": "const t = performance.now();\nawait new Promise((r) => setTimeout(r, 900));", "src/fake.test.ts": "jest.useFakeTimers();\nsetTimeout(() => 0, 900);" }));
    expect(control).toEqual({ "src/p.test.ts#performance.now": 1, "src/p.test.ts#setTimeout": 1 });
  });

  it("closes only when every ratchet list is empty", () => {
    const lists = [spec.s2, spec.s3, spec.s4.lines, spec.s4.branches, spec.s4.nesting, spec.s6, spec.s7, spec.q3t, spec.s8.helpers, spec.s8.fnv, spec.s8.duplicates, spec.s8.dead, spec.d1];
    const maps = [spec.s5, spec.s8.withholding, spec.t1.unknownCasts, spec.t1.nonNull, spec.t3, spec.e1, spec.q1t];
    const open = lists.some((list) => list.length > 0) || maps.some((map) => Object.keys(map).length > 0) || spec.s8.popupCasts > 1;
    expect({ closed: spec.closed, open }).toEqual({ closed: spec.closed, open: !spec.closed });
  });
});
