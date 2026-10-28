import { lookSignature } from "../visualManifest";
import { packAsset, packKey, type IdentityPack, type PackAsset } from "./pack";

export interface StageIdentity { pack: string; defaultFiles: Map<string, string> | null; looks: Record<string, { set: string; files: Map<string, string> }> }

export const PACK_SET_PREFIX = "pk_";

export function stageIdentity(pack: IdentityPack, verified: (asset: PackAsset) => boolean): StageIdentity {
  const looks: StageIdentity["looks"] = {};
  let defaultFiles: Map<string, string> | null = null;
  for (const [id, look] of Object.entries(pack.looks)) {
    const base = packAsset(pack, look.base);
    if (!base || !verified(base)) continue;
    const files = new Map<string, string>([["neutral", base.path]]);
    for (const [label, role] of Object.entries(look.expressions ?? {})) {
      const asset = packAsset(pack, role);
      if (asset && verified(asset)) files.set(label, asset.path);
    }
    if (id === pack.defaultLook) defaultFiles = files;
    else looks[lookSignature(look.fields)] = { set: `${PACK_SET_PREFIX}${id}`, files };
  }
  return { pack: packKey(pack), defaultFiles, looks };
}
