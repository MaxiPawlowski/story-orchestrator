import { qualityAccepts, TENSION_CURRENT_KEY, type NormalizedStoryV2, type PrimitiveValue, type Quality } from "@engine/index";
import { parseArcLine, parseEpistemicLine, parseLedgerLine, parseMemoryLine, parseSceneBreakLine } from "@memory/parse";
import { isTensionLevel, levelToNumeric } from "@pacing/index";
import type { ParsedSharedRead } from "./types";

const deltaPattern = /^DELTA\s+(?:q=)?([^\s=]+)\s+value=(.+?)\s+evidence="([\s\S]*)"\s*$/;
const bareDeltaPattern = /^([A-Za-z0-9_]+)=(?:value=)?(.+?)\s+evidence="([\s\S]*)"\s*$/;
const bareWordPattern = /^[A-Za-z][\w -]*$/;
const factPattern = /^FACT\s+importance=([123])\s+text="([\s\S]+?)"\s+evidence="([\s\S]+)"\s*$/;
const channelNoisePattern = /^(?:\[\d+\]|<[^<>\n]{0,32}>)+\s*/;
const harmonyFinalPattern = /<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|(?:end|return|start)\|>|$)/i;
const harmonyTokenPattern = /<\|[^|>]*\|>/g;

const reasoningLeadPattern = /^(?:\s|\[\d+\]|<\|start\|>assistant|<\|assistant\|>)*/i;

interface ReasoningForm {
  open: string;
  close: string;
  orphanClose: boolean;
}

const reasoningForms: ReasoningForm[] = [
  { open: "<think>", close: "<\\/think>", orphanClose: true },
  { open: "<thinking>", close: "<\\/thinking>", orphanClose: true },
  { open: "<\\|channel>(?:thought|analysis)", close: "<channel\\|>", orphanClose: false },
  { open: "<\\|channel\\|>analysis<\\|message\\|>", close: "<\\|end\\|>|(?=<\\|(?:start|channel)\\|>)", orphanClose: false },
];

const reasoningBlockEnd = (text: string, form: ReasoningForm): number => {
  const tokens = new RegExp(`${form.open}|(${form.close})`, "gi");
  let depth = 0;
  let lastClose = -1;
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    if (!match[0]) tokens.lastIndex += 1;
    if (match[1] === undefined) {
      depth += 1;
      continue;
    }
    depth -= 1;
    lastClose = match.index + match[0].length;
    if (depth === 0) return lastClose;
  }
  return lastClose;
};

const orphanCloseEnd = (text: string, form: ReasoningForm): number => {
  const close = new RegExp(form.close, "i").exec(text);
  if (!close || new RegExp(form.open, "i").test(text.slice(0, close.index))) return -1;
  return close.index + close[0].length;
};

export function stripReasoningBlocks(raw: string): string {
  let text = raw;
  let stripped = false;
  for (;;) {
    const rest = text.slice(text.match(reasoningLeadPattern)?.[0].length ?? 0);
    const opened = reasoningForms.find((form) => new RegExp(`^(?:${form.open})`, "i").test(rest));
    const end = opened ? reasoningBlockEnd(rest, opened) : Math.max(-1, ...reasoningForms.filter((form) => form.orphanClose).map((form) => orphanCloseEnd(rest, form)));
    if (opened && end < 0) return "";
    if (end < 0) return stripped ? text.trim() : text;
    text = rest.slice(end);
    stripped = true;
  }
}

const stripChannelTokens = (line: string): string => line.replace(channelNoisePattern, "").trim();

export function stripChannelNoise(raw: string): string {
  const finalMatch = raw.match(harmonyFinalPattern);
  const body = stripReasoningBlocks(finalMatch ? finalMatch[1] : raw);
  const lines = body.replace(harmonyTokenPattern, "").split(/\r?\n/).map((line) => stripChannelTokens(line));
  while (lines.length && /^(?:thought|analysis|final)?$/i.test(lines[0])) lines.shift();
  return lines.join("\n").trim();
}

const parseBareWord = (raw: string): string | undefined => {
  const word = raw.match(/^'([^']*)'$/)?.[1] ?? raw;
  return bareWordPattern.test(word) ? word : undefined;
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

const STATED_NAME_WORDS = 8;

const trimStatedName = (quality: Quality, value: PrimitiveValue | undefined): PrimitiveValue | undefined => {
  if (quality.type !== "string" || typeof value !== "string") return value;
  const trimmed = value.trim();
  const body = trimmed.replace(/[.,;:]$/, "");
  if (body === trimmed || /[.!?…;:]/.test(body) || body.split(/\s+/).length > STATED_NAME_WORDS) return value;
  return body;
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
      // The delta's origin is the parser's to state, never the story's to lend:
      // copying the declared source onto a model line made a code-owned quality look extractor-written
      // and walked past the blackboard's own source check.
      if (quality.source !== "extractor") {
        result.rejected.push({ line, reason: "code-owned quality" });
        continue;
      }
      if (!delta[3].trim()) {
        result.rejected.push({ line, reason: "missing evidence" });
        continue;
      }
      const rawValue = delta[2].trim();
      const value = trimStatedName(quality, parseJsonLiteral(rawValue) ?? parseBareWord(rawValue));
      if (q === TENSION_CURRENT_KEY) {
        if (!isTensionLevel(value)) {
          result.rejected.push({ line, reason: "invalid value" });
          continue;
        }
        result.deltas.push({ delta: { q, v: levelToNumeric(value), source: "extractor" }, evidence: delta[3], rawLevel: value, line });
        continue;
      }
      if (value === undefined || !qualityAccepts(quality, value)) {
        result.rejected.push({ line, reason: "invalid value" });
        continue;
      }
      result.deltas.push({ delta: { q, v: value, source: "extractor" }, evidence: delta[3], line });
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

    if (/^\[(knows|unaware|suspects|believes|hiding|intends)\]/i.test(line)) {
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
