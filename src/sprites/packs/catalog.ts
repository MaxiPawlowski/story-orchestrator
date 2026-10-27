import { fnv1a } from "@runtime/hash";
import type { VisualPackRef } from "@engine/schema";
import { packDigestText, packKey, readVisualPack, type VisualPack } from "./pack";

export interface PackListing { file: string; pack: unknown }
export interface PackRefusal { file: string; problems: string[] }
export interface PackCatalog { packs: ReadonlyMap<string, VisualPack>; refused: PackRefusal[]; revision: string }

export const MAX_INSTALLED_PACKS = 512;
export const EMPTY_CATALOG: PackCatalog = { packs: new Map(), refused: [], revision: "empty" };

export async function packCatalog(listing: readonly PackListing[], hash: (text: string) => Promise<string>): Promise<PackCatalog> {
  const packs = new Map<string, VisualPack>();
  const refused: PackRefusal[] = [];
  for (const entry of listing.slice(0, MAX_INSTALLED_PACKS)) {
    const read = readVisualPack(entry.pack);
    if (!read.ok) { refused.push({ file: entry.file, problems: read.problems }); continue; }
    if (await hash(packDigestText(read.pack)) !== read.pack.digest) { refused.push({ file: entry.file, problems: ["digest: does not match the pack's content"] }); continue; }
    const key = packKey(read.pack);
    if (packs.has(key)) { refused.push({ file: entry.file, problems: [`id: ${key} is installed twice`] }); continue; }
    packs.set(key, read.pack);
  }
  if (listing.length > MAX_INSTALLED_PACKS) refused.push({ file: "", problems: [`only the first ${MAX_INSTALLED_PACKS} packs are read`] });
  return { packs, refused, revision: fnv1a([...packs.keys()].sort().join("\n")) };
}

export const newerRevision = (catalog: PackCatalog, ref: VisualPackRef): VisualPack | null => {
  const pinned = catalog.packs.get(packKey(ref));
  let newest: VisualPack | null = null;
  for (const pack of catalog.packs.values()) {
    if (pack.id !== ref.id || pack.digest === ref.digest || (pinned && pack.revision <= pinned.revision)) continue;
    if (!newest || pack.revision > newest.revision) newest = pack;
  }
  return newest;
};
