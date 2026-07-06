import { TENSION_CURRENT_KEY, type NormalizedStoryV2, type PrimitiveValue, type Quality } from "@engine/index";
import { parseArcLine, parseMemoryLine, parseSceneBreakLine } from "@memory/parse";
import { isTensionLevel, levelToNumeric } from "@pacing/index";
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
  const result: ParsedSharedRead = { deltas: [], facts: [], memory: [], arcs: [], rejected: [] };
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
      if (q === TENSION_CURRENT_KEY) {
        if (!isTensionLevel(value)) {
          result.rejected.push({ line, reason: "invalid value" });
          continue;
        }
        result.deltas.push({ delta: { q, v: levelToNumeric(value), source: quality.source }, evidence: delta[3], rawLevel: value });
        continue;
      }
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

    if (/^MEMORY\s+/i.test(line)) {
      const parsed = parseMemoryLine(line);
      if (parsed.entry) result.memory.push(parsed.entry);
      else result.rejected.push({ line, reason: parsed.reason ?? "invalid memory line" });
      continue;
    }

    if (/^SCENE_(BREAK|NONE)\b/i.test(line)) {
      const signal = parseSceneBreakLine(line);
      if (signal === null) continue;
      if (signal) {
        result.sceneBreak = signal;
        continue;
      }
      result.rejected.push({ line, reason: "invalid scene break line" });
      continue;
    }

    if (/^\[(arc|resolved)\]/i.test(line)) {
      const arc = parseArcLine(line);
      if (arc) result.arcs.push(arc);
      else result.rejected.push({ line, reason: "invalid arc line" });
      continue;
    }

    result.rejected.push({ line, reason: "unrecognized line" });
  }

  return result;
}
