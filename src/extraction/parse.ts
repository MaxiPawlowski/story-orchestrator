import { TENSION_CURRENT_KEY, type NormalizedStoryV2, type PrimitiveValue, type Quality } from "@engine/index";
import { parseArcLine, parseEpistemicLine, parseLedgerLine, parseMemoryLine, parseSceneBreakLine } from "@memory/parse";
import { isTensionLevel, levelToNumeric } from "@pacing/index";
import type { ParsedSharedRead } from "./types";

const deltaPattern = /^DELTA\s+(?:q=)?([^\s=]+)\s+value=(.+?)\s+evidence="([\s\S]*)"\s*$/;
const bareDeltaPattern = /^([A-Za-z0-9_]+)=(.+?)\s+evidence="([\s\S]*)"\s*$/;
const factPattern = /^FACT\s+importance=([123])\s+text="([\s\S]+?)"\s+evidence="([\s\S]+)"\s*$/;
const channelNoisePattern = /^(?:\[\d+\]|<[^<>\n]{0,32}>)+\s*/;
const harmonyFinalPattern = /<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|(?:end|return|start)\|>|$)/i;
const harmonyTokenPattern = /<\|[^|>]*\|>/g;

const stripChannelTokens = (line: string): string => line.replace(channelNoisePattern, "").trim();

export function stripChannelNoise(raw: string): string {
  const finalMatch = raw.match(harmonyFinalPattern);
  const body = finalMatch ? finalMatch[1] : raw;
  const lines = body.replace(harmonyTokenPattern, "").split(/\r?\n/).map((line) => stripChannelTokens(line));
  while (lines.length && /^(?:thought|analysis|final)?$/i.test(lines[0])) lines.shift();
  return lines.join("\n").trim();
}

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
  const result: ParsedSharedRead = { deltas: [], facts: [], memory: [], arcs: [], epistemic: [], ledger: [], rejected: [] };
  const lines = raw.split(/\r?\n/).map((line) => stripChannelTokens(line)).filter(Boolean);

  for (const line of lines) {
    if (line === "NO_DELTA") continue;
    const delta = line.match(deltaPattern) ?? line.replace(/^DELTA\s+/, "").match(bareDeltaPattern);
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
      const rawValue = delta[2].trim();
      const value = parseJsonLiteral(rawValue) ?? (/^[A-Za-z][\w -]*$/.test(rawValue) ? rawValue : undefined);
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

    if (/^\[(knows|unaware|suspects|believes|hiding)\]/i.test(line)) {
      const signal = parseEpistemicLine(line);
      if (signal) result.epistemic.push(signal);
      else result.rejected.push({ line, reason: "invalid epistemic line" });
      continue;
    }

    if (/^\[state:/i.test(line)) {
      const signals = parseLedgerLine(line);
      if (signals.length) result.ledger.push(...signals);
      else result.rejected.push({ line, reason: "invalid state line" });
      continue;
    }

    result.rejected.push({ line, reason: "unrecognized line" });
  }

  return result;
}
