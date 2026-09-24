import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|stories)\.tsx?$/.test(entry.name) ? [path] : [];
  });

const WRITERS: RegExp[] = [
  /extraction\s*:\s*\{[^{}]*\benabled\s*:\s*false\b/,
  /setExtractionSettings\(\s*\{[^{}]*\benabled\s*:\s*false\b/,
  /\.extraction(?:\.settings)?\.enabled\s*=(?!=)/,
  /\bpauseExtraction\b/,
];

const writesExtractionEnabled = (text: string): string[] =>
  WRITERS.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);

describe("v2.4 plan 03 D3 / D4: the runtime never switches extraction off", () => {
  it("no src module writes extraction.enabled", () => {
    const offenders = walk(SRC)
      .map((path) => ({ path: relative(SRC, path).replace(/\\/g, "/"), hits: writesExtractionEnabled(readFileSync(path, "utf8")) }))
      .filter((entry) => entry.hits.length);
    expect(offenders).toEqual([]);
  });

  it("control: the deleted install-wide pause is caught by the matcher", () => {
    const pause = `pauseExtraction(message: string) {\n    setGlobalSettings({ extraction: { enabled: false } });\n  }`;
    expect(writesExtractionEnabled(pause).length).toBeGreaterThanOrEqual(2);
    expect(writesExtractionEnabled("this.extras.extraction.settings.enabled = false;")).toHaveLength(1);
    expect(writesExtractionEnabled("manager.setExtractionSettings({ enabled: false })").length).toBeGreaterThanOrEqual(1);
  });

  it("control: the player's own toggle and a read are not writes", () => {
    expect(writesExtractionEnabled("manager.setExtractionSettings({ enabled: event.target.checked })")).toEqual([]);
    expect(writesExtractionEnabled("if (!settings.extraction.enabled) return;")).toEqual([]);
    expect(writesExtractionEnabled("return extraction.enabled === true;")).toEqual([]);
  });
});
