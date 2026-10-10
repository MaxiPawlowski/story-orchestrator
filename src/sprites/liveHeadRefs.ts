import { isRecord } from "@utils/guards";

export interface LiveHeadRef {
  member: string;
  look: string;
  artHash: string;
  source: string;
  manifest: string;
}

export const liveHeadKey = (ref: Pick<LiveHeadRef, "member" | "look" | "artHash">): string =>
  JSON.stringify([ref.member, ref.look, ref.artHash]);

export const localHeadAsset = (value: unknown): value is string => typeof value === "string"
  && ((/^\/(?!\/)[^\\]*$/.test(value) && [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127))
    || /^data:(?:image\/png;base64,|application\/json,)/.test(value));

export function liveHeadRefs(value: unknown): Record<string, LiveHeadRef> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 100).flatMap(([key, entry]) => {
    if (!isRecord(entry) || typeof entry.member !== "string" || !entry.member || typeof entry.look !== "string" || !entry.look
      || typeof entry.artHash !== "string" || !/^[a-f0-9]{64}$/.test(entry.artHash)
      || !localHeadAsset(entry.source) || !localHeadAsset(entry.manifest) || entry.manifest.length > 24_000_000) return [];
    const ref = { member: entry.member, look: entry.look, artHash: entry.artHash, source: entry.source, manifest: entry.manifest };
    return key === liveHeadKey(ref) ? [[key, ref]] : [];
  }));
}

export function findLiveHead(refs: Record<string, LiveHeadRef>, member: string, look: string, source: string): LiveHeadRef | undefined {
  const matches = Object.values(refs).filter((ref) => ref.member === member && ref.look === look && ref.source === source);
  return matches.length === 1 ? matches[0] : undefined;
}
