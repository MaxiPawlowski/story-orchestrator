import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });

const PARAM_PROPERTY = /(?:private|public|protected|readonly)\s+(?:readonly\s+)?(\w+)\s*[?:]/g;
const DELIMITERS = new Set([",", "{", "(", ";"]);

const eagerReads = (source: string): string[] => {
  const found: string[] = [];
  const text = source.replace(/\r\n/g, "\n");
  for (const ctor of text.matchAll(/constructor\(([^)]*)\)/g)) {
    const params = [...ctor[1].matchAll(PARAM_PROPERTY)].map((match) => match[1]);
    if (params.length === 0) continue;
    const classStart = text.lastIndexOf("class ", ctor.index);
    if (classStart < 0) continue;
    const region = text.slice(classStart, ctor.index);
    for (const name of params) {
      for (const use of region.matchAll(new RegExp(`this\\.${name}\\b`, "g"))) {
        let cursor = (use.index ?? 0) - 1;
        while (cursor >= 0 && !DELIMITERS.has(region[cursor])) cursor -= 1;
        if (region.slice(cursor + 1, use.index).includes("=>")) continue;
        const line = text.slice(0, classStart + (use.index ?? 0)).split("\n").length;
        found.push(`${line}: this.${name}`);
      }
    }
  }
  return found;
};

describe("class field initializers never read a constructor parameter property eagerly", () => {
  it("the production bundle (babel, define semantics) runs field initializers before parameter properties are assigned", () => {
    const offenders = walk(SRC).flatMap((path) => eagerReads(readFileSync(path, "utf8")).map((hit) => `${relative(SRC, path)}:${hit}`));
    expect(offenders).toEqual([]);
  });

  it("flags the shape that crashed every story import (memoryCoordinator chapters, 2026-09-30)", () => {
    const planted = "class A {\n  readonly port = new Port({ deps: this.deps, read: () => this.deps.x });\n  constructor(private readonly deps: Deps) {}\n}\n";
    expect(eagerReads(planted)).toEqual(["2: this.deps"]);
  });

  it("accepts a read deferred behind an arrow", () => {
    const safe = "class A {\n  readonly port = new Port({ read: () => this.deps.x, get: () => this.deps });\n  constructor(private readonly deps: Deps) {}\n}\n";
    expect(eagerReads(safe)).toEqual([]);
  });
});
