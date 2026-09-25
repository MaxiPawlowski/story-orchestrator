import { readFileSync } from "fs";
import { join } from "path";

export const LEGACY_PATTERN = /legacy|migrat|OrHash|version\s*[!=]==\s*\d/i;

export interface AllowedHit {
  file: string;
  text: string;
  count: number;
  reason: string;
}

export interface LegacyBaseline {
  closed: boolean;
  baseline: Record<string, number>;
  allowlist: AllowedHit[];
}

export const loadLegacyBaseline = (): LegacyBaseline =>
  JSON.parse(readFileSync(join(__dirname, "legacy-baseline.json"), "utf8")) as LegacyBaseline;

export const legacyHits = (text: string): string[] =>
  text.split(/\r?\n/).map((line) => line.trim()).filter((line) => LEGACY_PATTERN.test(line));

export interface LegacyVerdict {
  unexpected: string[];
  stale: string[];
  allowlistDrift: string[];
  remaining: string[];
}

export function judgeLegacy(files: Record<string, string>, spec: LegacyBaseline): LegacyVerdict {
  const unexpected: string[] = [];
  const stale: string[] = [];
  const allowlistDrift: string[] = [];
  const counts: Record<string, number> = {};
  for (const [file, text] of Object.entries(files)) {
    const allowed = spec.allowlist.filter((entry) => entry.file === file);
    let rest = 0;
    for (const hit of legacyHits(text)) {
      if (allowed.some((entry) => entry.text === hit)) continue;
      rest += 1;
    }
    for (const entry of allowed) {
      const seen = legacyHits(text).filter((hit) => hit === entry.text).length;
      if (seen !== entry.count) allowlistDrift.push(`${file}: "${entry.text}" seen ${seen}, allowed exactly ${entry.count}`);
    }
    if (rest) counts[file] = rest;
  }
  for (const entry of spec.allowlist) {
    if (!(entry.file in files)) allowlistDrift.push(`${entry.file}: allowlisted but not scanned`);
  }
  for (const [file, count] of Object.entries(counts)) {
    const allowed = spec.baseline[file] ?? 0;
    if (count > allowed) unexpected.push(`${file}: ${count} hit(s), baseline ${allowed}`);
  }
  for (const [file, allowed] of Object.entries(spec.baseline)) {
    const count = counts[file] ?? 0;
    if (count < allowed) stale.push(`${file}: baseline ${allowed}, now ${count} (shrink the baseline)`);
  }
  const remaining = spec.closed ? Object.keys(spec.baseline) : [];
  return { unexpected, stale, allowlistDrift, remaining };
}
