import type { CardFieldIndex, NormalizedStoryV2, PrimitiveValue, Quality, RosterMember, StoryV2, ValidationError } from "./schema";
import { isRecord } from "@utils/guards";
import { qualityAccepts, type Blackboard } from "./blackboard";

export function indexCardFields(roster: RosterMember[], player: StoryV2["player"], qualities: Record<string, Quality>, errors: ValidationError[]): CardFieldIndex {
  const index: CardFieldIndex = {};
  const owners = [...roster.map((member, at) => ({ owner: member.id, card: member.card, path: `roster.${at}.card` })), { owner: "player", card: player?.card, path: "player.card" }];
  for (const { owner, card, path } of owners) {
    if (card === undefined) continue;
    if (!isRecord(card) || !isRecord(card.fields)) { errors.push({ path, message: "card needs a fields object" }); continue; }
    if (Object.keys(card.fields).length > 64) errors.push({ path, message: "card may declare at most 64 fields" });
    for (const [field, binding] of Object.entries(card.fields)) {
      const location = `${path}.fields.${field}`;
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(field) || !isRecord(binding) || typeof binding.quality !== "string") {
        errors.push({ path: location, message: "card field needs a valid id and quality key" }); continue;
      }
      const quality = qualities[binding.quality];
      if (!quality || !["string", "enum"].includes(quality.type) || quality.source !== "extractor" || quality.latching || quality.monotonic) {
        errors.push({ path: location, message: "card field needs a non-latching extractor string or enum quality" }); continue;
      }
      if (index[binding.quality]) { errors.push({ path: location, message: "a quality may bind to only one card field" }); continue; }
      if (binding.visual !== undefined && typeof binding.visual !== "boolean") errors.push({ path: location, message: "visual must be boolean" });
      index[binding.quality] = { owner, field, visual: binding.visual === true };
    }
  }
  return index;
}

export function validateCardEffects(story: Pick<NormalizedStoryV2, "cardFieldByQuality" | "qualityByKey" | "checkpoints">, errors: ValidationError[]): void {
  const fields = Object.entries(story.cardFieldByQuality ?? {});
  story.checkpoints.forEach((checkpoint, at) => {
    if (checkpoint.effects?.card === undefined) return;
    const card = checkpoint.effects.card;
    if (!isRecord(card)) { errors.push({ path: `checkpoints.${at}.effects.card`, message: "card effects need owner objects" }); return; }
    for (const [owner, values] of Object.entries(card)) {
      if (!isRecord(values)) { errors.push({ path: `checkpoints.${at}.effects.card.${owner}`, message: "card effect needs field values" }); continue; }
      for (const [field, value] of Object.entries(values)) {
        const entry = fields.find(([, bound]) => bound.owner === owner && bound.field === field);
        if (!entry || typeof value !== "string" || value.length > 240 || !qualityAccepts(story.qualityByKey[entry[0]], value)) {
          errors.push({ path: `checkpoints.${at}.effects.card.${owner}.${field}`, message: "card effect must name a declared field with an allowed short value" });
        }
      }
    }
  });
}

export function applyCardEntry(story: NormalizedStoryV2, checkpoint: string, blackboard: Blackboard, boundary: number): void {
  const values = story.checkpointById[checkpoint]?.effects?.card;
  if (!values) return;
  for (const [key, binding] of Object.entries(story.cardFieldByQuality ?? {})) {
    const value = values[binding.owner]?.[binding.field];
    if (value !== undefined) blackboard.applyDelta({ q: key, v: value, source: "extractor", writer: "card-entry", boundary });
  }
}

export function cardValues(story: Pick<NormalizedStoryV2, "cardFieldByQuality">, values: Record<string, PrimitiveValue>, owner: string, visualOnly = false): Record<string, string> {
  return Object.fromEntries(Object.entries(story.cardFieldByQuality ?? {}).flatMap(([key, binding]) => {
    const value = values[key];
    return binding.owner === owner && (!visualOnly || binding.visual) && typeof value === "string" && value.trim() ? [[binding.field, value.slice(0, 240)]] : [];
  }));
}

export const publicLook = (fields: Record<string, string>): string => Object.entries(fields).map(([field, value]) => `${field}: ${value}`).join("; ");

export function cardReadKeys(story: Pick<NormalizedStoryV2, "cardFieldByQuality">, owners: string[], cursor = 0): string[] {
  const present = new Set([...owners, "player"]);
  const keys = Object.entries(story.cardFieldByQuality ?? {}).filter(([, binding]) => present.has(binding.owner)).map(([key]) => key);
  if (keys.length <= 12) return keys;
  const tail = keys.slice(8);
  return [...keys.slice(0, 8), ...Array.from({ length: Math.min(4, tail.length) }, (_, at) => tail[(Math.max(0, Math.floor(cursor)) + at) % tail.length])];
}
