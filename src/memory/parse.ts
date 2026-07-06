import { EPISTEMIC_TAGS, MEMORY_ENTRY_TYPES, MEMORY_EXPIRATIONS, SCENE_BREAK_REASONS, TIER_FOR_ENTRY_TYPE, type EpistemicTag, type MemoryEntryType, type ParsedArcSignal, type ParsedEpistemicSignal, type ParsedLedgerSignal, type ParsedMemoryLine, type SceneBreakSignal } from "./types";

const isMemoryEntryType = (value: string): value is MemoryEntryType => (MEMORY_ENTRY_TYPES as readonly string[]).includes(value);

const tokenPattern = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;

const tokenize = (rest: string): Map<string, string> => {
  const tokens = new Map<string, string>();
  let match: RegExpExecArray | null;
  tokenPattern.lastIndex = 0;
  while ((match = tokenPattern.exec(rest)) !== null) {
    const key = match[1].toLowerCase();
    const raw = match[2];
    const value = raw.startsWith("\"") && raw.endsWith("\"") ? raw.slice(1, -1) : raw;
    tokens.set(key, value);
  }
  return tokens;
};

export interface MemoryLineParseResult {
  entry?: ParsedMemoryLine;
  reason?: string;
}

export function parseMemoryLine(line: string): MemoryLineParseResult {
  if (!/^MEMORY\s+/i.test(line)) return { reason: "not a memory line" };
  const tokens = tokenize(line.slice(line.indexOf(" ") + 1));

  const type = tokens.get("type");
  if (!type || !isMemoryEntryType(type)) return { reason: "unknown memory type" };

  const importanceRaw = tokens.get("importance");
  if (!importanceRaw || !/^[123]$/.test(importanceRaw)) return { reason: "invalid importance" };
  const importance = Number(importanceRaw) as 1 | 2 | 3;

  const expiration = tokens.get("expiration");
  if (!expiration || !(MEMORY_EXPIRATIONS as readonly string[]).includes(expiration)) return { reason: "invalid expiration" };

  const text = tokens.get("text")?.trim();
  if (!text) return { reason: "missing text" };

  const evidence = tokens.get("evidence")?.trim();
  if (!evidence) return { reason: "missing evidence" };

  const tier = TIER_FOR_ENTRY_TYPE[type];
  const minLength = tier === "facts" ? 5 : 3;
  if (text.length <= minLength) return { reason: "content too short" };

  const entitiesRaw = tokens.get("entity");
  const entities = entitiesRaw ? entitiesRaw.split(",").map((entity) => entity.trim()).filter(Boolean) : [];
  const characterId = tokens.get("character")?.trim() || undefined;

  return {
    entry: {
      tier,
      type,
      importance,
      expiration: expiration as ParsedMemoryLine["expiration"],
      entities,
      characterId,
      text,
      evidence,
    },
  };
}

const arcPattern = /^\[(arc|resolved)\]\s+(.+)$/i;

export function parseArcLine(line: string): ParsedArcSignal | null {
  const match = line.match(arcPattern);
  if (!match) return null;
  const text = match[2].trim();
  if (!text) return null;
  return { kind: match[1].toLowerCase() === "resolved" ? "resolved" : "open", text };
}

const epistemicHidingPattern = /^\[hiding\]\s+(.+?)\s+from\s+(.+?)\s*\|\s*(.+)$/i;
const epistemicStandardPattern = /^\[(\w+)\]\s+(.+?)\s*\|\s*(.+)$/i;
const isEpistemicTag = (value: string): value is EpistemicTag => (EPISTEMIC_TAGS as readonly string[]).includes(value);

export function parseEpistemicLine(line: string): ParsedEpistemicSignal | null {
  const hiding = line.match(epistemicHidingPattern);
  if (hiding) {
    const subject = hiding[1].trim();
    const hiddenFrom = hiding[2].trim();
    const content = hiding[3].trim();
    if (!subject || !hiddenFrom || !content) return null;
    return { tag: "hiding", subject, hiddenFrom, content };
  }
  const standard = line.match(epistemicStandardPattern);
  if (!standard) return null;
  const tag = standard[1].toLowerCase();
  if (!isEpistemicTag(tag) || tag === "hiding") return null;
  const subject = standard[2].trim();
  const content = standard[3].trim();
  if (!subject || !content) return null;
  return { tag, subject, content };
}

const epistemicRetirePattern = /^\[retire\]/i;

export function parseEpistemicRetire(line: string): number[] {
  if (!epistemicRetirePattern.test(line.trim())) return [];
  const nums = line.trim().replace(epistemicRetirePattern, "").match(/\d+/g);
  return nums ? nums.map(Number) : [];
}

const ledgerLinePattern = /^\[state:([^\]]+):([^\]]+)\]\s*(.*)$/i;
const LEDGER_NOISE_VALUES = new Set(["unknown", "none", "n/a", "na", "not mentioned", "not specified", "unspecified", "unclear", "nothing"]);

export function parseLedgerLine(line: string): ParsedLedgerSignal[] {
  const match = line.match(ledgerLinePattern);
  if (!match) return [];
  const entity = match[1].trim();
  const entityType = match[2].trim().toLowerCase();
  const rest = match[3].trim();
  if (!entity || !entityType || !rest) return [];
  const signals: ParsedLedgerSignal[] = [];
  for (const chunk of rest.split("|")) {
    const eqIndex = chunk.indexOf("=");
    if (eqIndex === -1) continue;
    const field = chunk.slice(0, eqIndex).trim().toLowerCase().replace(/\s+/g, "_");
    const value = chunk.slice(eqIndex + 1).trim();
    if (!field || !value) continue;
    if (LEDGER_NOISE_VALUES.has(value.toLowerCase())) continue;
    signals.push({ entity, entityType, field, value });
  }
  return signals;
}

export function parseSceneBreakLine(line: string): SceneBreakSignal | null | undefined {
  if (/^SCENE_NONE\s*$/i.test(line)) return null;
  const match = line.match(/^SCENE_BREAK\s+at=(\d+)\s+reason=(\w+)\s*$/i);
  if (!match) return undefined;
  const reason = match[2].toLowerCase();
  if (!(SCENE_BREAK_REASONS as readonly string[]).includes(reason)) return undefined;
  return { at: Number(match[1]), reason: reason as SceneBreakSignal["reason"] };
}
