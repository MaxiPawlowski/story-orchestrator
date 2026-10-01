import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "./settingsModel";
import { DEFAULT_CHAPTER_SETTINGS } from "./chapters";

interface Baseline { version: number; installOwned: string[]; settings: Record<string, unknown> }

const baseline: Baseline = JSON.parse(readFileSync(resolve(__dirname, "../../test/sessions/baseline-settings.json"), "utf-8"));

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const leaves = (value: unknown, prefix = ""): string[] => {
  if (!isRecord(value) || !Object.keys(value).length) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
};

const at = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), value);

const owned = (path: string) => baseline.installOwned.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));

describe("plan 14 session baseline (AS-26)", () => {
  it("names every install-wide setting the product reads, except the install-owned paths", () => {
    const product = { ...defaultGlobalSettings(), memory: { ...defaultGlobalSettings().memory, chapters: DEFAULT_CHAPTER_SETTINGS } };
    const missing = leaves(product).filter((path) => !owned(path) && at(baseline.settings, path) === undefined);
    expect(missing).toEqual([]);
  });

  it("holds only values the product keeps: sanitizing it changes nothing it names", () => {
    const sanitized = sanitizeGlobalSettings(baseline.settings);
    const changed = leaves(baseline.settings).filter((path) => JSON.stringify(at(sanitized, path)) !== JSON.stringify(at(baseline.settings, path)));
    expect(changed).toEqual([]);
  });

  it("keeps the judge on with every use, and media off", () => {
    const sanitized = sanitizeGlobalSettings(baseline.settings);
    expect(sanitized.judge.enabled).toBe(true);
    expect(Object.values(sanitized.judge.uses).every(Boolean)).toBe(true);
    expect(sanitized.image.enabled).toBe(false);
    expect(sanitized.sprites.enabled).toBe(false);
    expect(baseline.installOwned).toContain("judge.noticesSeen");
  });
});
