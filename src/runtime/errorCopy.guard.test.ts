import { readFileSync } from "fs";
import { join } from "path";
import { ROOT, prodFiles } from "../../test/support/codeHealth";
import { judgeErrorCopy, type ErrorCopyInventory, type ErrorCopyRow } from "../../test/support/errorCopy";

const inventory = JSON.parse(readFileSync(join(ROOT, "test/findings/errorCopy.json"), "utf8")) as ErrorCopyInventory;
const read = (path: string) => readFileSync(path, "utf8");

const plantedRead = (files: Record<string, string>) => {
  const paths = Object.fromEntries(Object.entries(files).map(([path, text]) => [join(ROOT, path), text]));
  return { files: Object.keys(paths), read: (path: string) => paths[path] ?? "" };
};

describe("error copy inventory (v2.5 plan 03 E2)", () => {
  const verdict = judgeErrorCopy(prodFiles(), read, inventory);

  it("lists every toast/popup literal, error-interpolating template and silent catch in prod, and nothing else", () => {
    expect({ unexpected: verdict.unexpected, stale: verdict.stale }).toEqual({ unexpected: [], stale: [] });
  });

  it("states surface, rawError, silentCatch and a verdict that follows the pass rule for every row", () => {
    expect(verdict.problems).toEqual([]);
  });

  it("closes only when no row fails", () => {
    expect({ closed: inventory.closed, failing: inventory.closed ? verdict.failing : [] }).toEqual({ closed: inventory.closed, failing: [] });
    if (!inventory.closed) expect(verdict.failing.length).toBeGreaterThan(0);
  });

  it("control: a raw error.message in a player toast and a silent catch absent from the inventory fail", () => {
    const planted = plantedRead({ "src/p.ts": 'export function run(error: Error) {\n  toastr.info(`Failed: ${error.message}`);\n  try { go(); } catch { return; }\n}' });
    const result = judgeErrorCopy(planted.files, planted.read, { closed: false, rows: [] });
    expect(result.unexpected).toEqual([
      "src/p.ts#run | 1 | `Failed: ${error.message}`: 1, listed 0",
      "src/p.ts#run | 2 | `Failed: ${error.message}`: 1, listed 0",
      "src/p.ts#run | 3 | catch {} #1: 1, listed 0",
    ]);
  });

  it("control: a player row carrying a raw error cannot be marked pass", () => {
    const row: ErrorCopyRow = { site: "src/p.ts#run", kind: 2, template: "`${error.message}`", surface: "player", rawError: true, silentCatch: null, verdict: "pass", reason: "planted" };
    const planted = plantedRead({ "src/p.ts": "export function run(error: Error) {\n  return `${error.message}`;\n}" });
    expect(judgeErrorCopy(planted.files, planted.read, { closed: false, rows: [row] }).problems).toEqual(["src/p.ts#run | 2 | `${error.message}`: verdict pass, the pass rule says fail"]);
  });
});
