import type { NeighbourTag } from "./types";
import { SOCIAL_ACTS, type SocialAct } from "@engine/socialActs";

export { SOCIAL_ACTS, type SocialAct };

export const READ_KEYS_MAX = 3;
export const READ_KEY_CHARS = 40;
export const READ_KEY_WORDS = 4;

const TAG_NAMES = "same|update|keys|act";
const TAG_TOKEN = String.raw`\s+(?:${TAG_NAMES})=(?:"[^"]*"|[^\s"]+)`;
const trailingTags = new RegExp(String.raw`"((?:${TAG_TOKEN})+)\s*$`, "i");
const tagsBeforeEvidence = new RegExp(String.raw`"((?:${TAG_TOKEN})+)(\s+evidence=")`, "i");
const actBeforeEvidence = /\s+act=([A-Za-z]+)(?=\s+evidence=)/i;
const tagPattern = new RegExp(String.raw`(?:^|\s)(${TAG_NAMES})=("[^"]*"|[^\s"]+)`, "gi");
const aliasPattern = /^m(\d{1,2})$/i;

export interface ReadTags {
  neighbour?: NeighbourTag;
  keys?: string[];
  act?: SocialAct;
}

const unquote = (value: string) => (value.startsWith("\"") && value.endsWith("\"") ? value.slice(1, -1) : value);

const tagMap = (text: string): Map<string, string> => {
  const found = new Map<string, string>();
  tagPattern.lastIndex = 0;
  for (let match = tagPattern.exec(text); match; match = tagPattern.exec(text)) found.set(match[1].toLowerCase(), unquote(match[2]));
  return found;
};

export function splitReadTags(line: string): { line: string; tags: Map<string, string> } {
  let rest = line;
  const tags = new Map<string, string>();
  const take = (text: string) => tagMap(text).forEach((value, key) => tags.set(key, value));
  const trailing = rest.match(trailingTags);
  if (trailing && trailing.index !== undefined) {
    take(trailing[1]);
    rest = `${rest.slice(0, trailing.index)}"`;
  }
  const middle = rest.match(tagsBeforeEvidence);
  if (middle && middle.index !== undefined) {
    take(middle[1]);
    rest = `${rest.slice(0, middle.index)}"${middle[2]}${rest.slice(middle.index + middle[0].length)}`;
  }
  const act = rest.match(actBeforeEvidence);
  if (act && act.index !== undefined) {
    tags.set("act", act[1]);
    rest = `${rest.slice(0, act.index)}${rest.slice(act.index + act[0].length)}`;
  }
  return { line: rest, tags };
}

export function readKeys(raw: string | undefined, entities: readonly string[] = []): string[] | undefined {
  if (!raw) return undefined;
  const taken = new Set(entities.map((entity) => entity.trim().toLowerCase()));
  const keys: string[] = [];
  for (const part of raw.split(",")) {
    const key = part.trim().replace(/\s+/g, " ");
    const folded = key.toLowerCase();
    if (!key || key.length > READ_KEY_CHARS || key.split(" ").length > READ_KEY_WORDS || taken.has(folded)) continue;
    taken.add(folded);
    keys.push(key);
    if (keys.length >= READ_KEYS_MAX) break;
  }
  return keys.length ? keys : undefined;
}

export function neighbourOf(tags: ReadonlyMap<string, string>): NeighbourTag | undefined {
  const same = tags.get("same");
  const update = tags.get("update");
  if (same !== undefined && update !== undefined) return undefined;
  const raw = same ?? update;
  const alias = raw?.trim().match(aliasPattern);
  return alias ? { kind: same !== undefined ? "same" : "update", id: `m${Number(alias[1])}` } : undefined;
}

export const socialAct = (raw: string | undefined): SocialAct | undefined => {
  const value = raw?.trim().toLowerCase();
  return value && (SOCIAL_ACTS as readonly string[]).includes(value) ? value as SocialAct : undefined;
};

export function readTagsOf(tags: ReadonlyMap<string, string>, entities: readonly string[] = []): ReadTags {
  const neighbour = neighbourOf(tags);
  const keys = readKeys(tags.get("keys"), entities);
  const act = socialAct(tags.get("act"));
  return { ...(neighbour ? { neighbour } : {}), ...(keys ? { keys } : {}), ...(act ? { act } : {}) };
}

export const rowTags = (line: { keys?: string[]; neighbour?: NeighbourTag }): { keys?: string[]; neighbour?: NeighbourTag } =>
  ({ ...(line.keys?.length ? { keys: line.keys } : {}), ...(line.neighbour ? { neighbour: line.neighbour } : {}) });
