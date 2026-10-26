import type { NormalizedStory } from "@engine/index";
import { packCatalog, EMPTY_CATALOG, type PackCatalog, type PackListing } from "./catalog";
import { packKey, type PackAsset } from "./pack";
import { resolveVisualScene, type SceneInput, type VisualScene } from "./scene";
import { stageIdentity, type StageIdentity } from "./stageLooks";

export interface BridgeDeps {
  list(signal?: AbortSignal): Promise<PackListing[] | null>;
  fileHash(path: string, signal?: AbortSignal): Promise<string>;
  textHash(text: string): Promise<string>;
}
export interface BridgeRead { fresh?: boolean; signal?: AbortSignal }
export type SceneRequest = Omit<SceneInput, "catalog" | "verified">;

const MAX_PASSES = 4;

export function createVisualBridge(deps: BridgeDeps) {
  let current: Promise<PackCatalog> | null = null;
  let hashes = new Map<string, Promise<string | null>>();

  const catalog = (read: BridgeRead = {}): Promise<PackCatalog> => {
    if (read.fresh || !current) {
      hashes = new Map();
      const loading = deps.list(read.signal).then((listing) => (listing ? packCatalog(listing, deps.textHash) : EMPTY_CATALOG));
      current = loading;
      loading.catch(() => { if (current === loading) current = null; });
    }
    return current;
  };

  const hashOf = (path: string, read: BridgeRead): Promise<string | null> => {
    const known = read.fresh ? undefined : hashes.get(path);
    if (known) return known;
    const pending = deps.fileHash(path, read.signal).catch(() => null);
    hashes.set(path, pending);
    return pending;
  };

  async function verifying<T>(run: (verified: (asset: PackAsset) => boolean) => T, read: BridgeRead): Promise<T> {
    const seen = new Map<string, string | null>();
    for (let pass = 0; ; pass += 1) {
      const asked = new Map<string, PackAsset>();
      const result = run((asset) => {
        if (!seen.has(asset.path)) { asked.set(asset.path, asset); return true; }
        return seen.get(asset.path) === asset.sha256;
      });
      if (!asked.size || pass >= MAX_PASSES) return asked.size ? run((asset) => seen.get(asset.path) === asset.sha256) : result;
      const answers = await Promise.all([...asked.keys()].map(async (path) => [path, await hashOf(path, read)] as const));
      read.signal?.throwIfAborted();
      for (const [path, hash] of answers) seen.set(path, hash);
    }
  }

  return {
    catalog,
    async scene(request: SceneRequest, read: BridgeRead = {}): Promise<VisualScene> {
      const packs = await catalog(read);
      return verifying((verified) => resolveVisualScene({ ...request, catalog: packs, verified }), read);
    },
    async stage(story: Pick<NormalizedStory, "illustrations">, member: string, read: BridgeRead = {}): Promise<StageIdentity | null> {
      const ref = story.illustrations?.packs?.identities?.[member];
      if (!ref) return null;
      const pack = (await catalog(read)).packs.get(packKey(ref));
      if (pack?.kind !== "identity") return null;
      const identity = await verifying((verified) => stageIdentity(pack, verified), read);
      return identity.defaultFiles || Object.keys(identity.looks).length ? identity : null;
    },
    async stillCurrent(scene: VisualScene, signal?: AbortSignal): Promise<boolean> {
      const packs = await catalog({ fresh: true, signal });
      if (scene.packs.some((key) => !packs.packs.has(key))) return false;
      const answers = await Promise.all(scene.dependencies.map(async (entry) => (await hashOf(entry.path, { fresh: true, signal })) === entry.sha256));
      return answers.every(Boolean);
    },
  };
}

export type VisualBridge = ReturnType<typeof createVisualBridge>;
