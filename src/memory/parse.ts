import { MEMORY_ENTRY_TYPES, MEMORY_EXPIRATIONS, SCENE_BREAK_REASONS, TIER_FOR_ENTRY_TYPE, type MemoryEntryType, type ParsedArcSignal, type ParsedMemoryLine, type SceneBreakSignal } from "./types";

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

export function parseSceneBreakLine(line: string): SceneBreakSignal | null | undefined {
  if (/^SCENE_NONE\s*$/i.test(line)) return null;
  const match = line.match(/^SCENE_BREAK\s+at=(\d+)\s+reason=(\w+)\s*$/i);
  if (!match) return undefined;
  const reason = match[2].toLowerCase();
  if (!(SCENE_BREAK_REASONS as readonly string[]).includes(reason)) return undefined;
  return { at: Number(match[1]), reason: reason as SceneBreakSignal["reason"] };
}
