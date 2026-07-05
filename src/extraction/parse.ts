import type { NormalizedStoryV2, PrimitiveValue, Quality } from "@engine/index";
import type { ParsedSharedRead } from "./types";

const deltaPattern = /^DELTA\s+q=([^\s]+)\s+value=(.+?)\s+evidence="([\s\S]*)"\s*$/;
const factPattern = /^FACT\s+importance=([123])\s+text="([\s\S]+?)"\s+evidence="([\s\S]+)"\s*$/;

const valueMatches = (quality: Quality, value: PrimitiveValue) => {
  if (quality.type === "bool") return typeof value === "boolean";
  if (quality.type === "string") return typeof value === "string";
  if (quality.type === "enum") return typeof value === "string" && Boolean(quality.values?.includes(value));
  if (quality.type === "float") return typeof value === "number" && Number.isFinite(value);
  return typeof value === "number" && Number.isInteger(value);
};

const parseJsonLiteral = (raw: string): PrimitiveValue | undefined => {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") return parsed;
  } catch {
    return undefined;
  }
  return undefined;
};

export function parseSharedReadResponse(raw: string, story: Pick<NormalizedStoryV2, "qualityByKey">): ParsedSharedRead {
  const result: ParsedSharedRead = { deltas: [], facts: [], rejected: [] };
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    if (line === "NO_DELTA") continue;
    const delta = line.match(deltaPattern);
    if (delta) {
      const q = delta[1];
      const quality = story.qualityByKey[q];
      if (!quality) {
        result.rejected.push({ line, reason: "unknown quality" });
        continue;
      }
      if (!delta[3].trim()) {
        result.rejected.push({ line, reason: "missing evidence" });
        continue;
      }
      const value = parseJsonLiteral(delta[2]);
      if (value === undefined || !valueMatches(quality, value)) {
        result.rejected.push({ line, reason: "invalid value" });
        continue;
      }
      result.deltas.push({ delta: { q, v: value, source: quality.source }, evidence: delta[3] });
      continue;
    }

    const fact = line.match(factPattern);
    if (fact) {
      result.facts.push({ importance: Number(fact[1]) as 1 | 2 | 3, text: fact[2], evidence: fact[3] });
      continue;
    }

    result.rejected.push({ line, reason: "unrecognized line" });
  }

  return result;
}
