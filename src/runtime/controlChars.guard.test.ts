import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const TEXT = /\.(?:css|ts|tsx|json|md)$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : TEXT.test(entry.name) ? [path] : [];
  });

describe("source text carries no control characters (v3.0 cpu-1031b)", () => {
  it("finds none: an unescaped \\f or \\b written by a script breaks CSS strings and regexes", () => {
    const offenders = walk(SRC).flatMap((path) => readFileSync(path, "utf8").split(/\r?\n/)
      .flatMap((line, index) => (CONTROL.test(line) ? [`${relative(ROOT, path).replace(/\\/g, "/")}:${index + 1}`] : [])));
    expect(offenders).toEqual([]);
  });

  it("the pattern catches a form feed in a CSS string (planted control)", () => {
    expect(CONTROL.test(`content: "${String.fromCharCode(12)}057"`)).toBe(true);
    expect(CONTROL.test("content: \"\\f057\";\t")).toBe(false);
  });
});
