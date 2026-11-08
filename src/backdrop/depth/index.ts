import type { BackdropAutoInput, BackdropBase, BackdropLayerSpec } from "../types";
import { registerLayer } from "../stage/registry";
import { notifyAssetsChanged, onBaseShown, registerAssetProvider, shownBase } from "../assets";
import { depthCache } from "./host";
import { depthFogLayer, parallaxLayer } from "./layers";
import { PARALLAX } from "./parallax";

let stop: (() => void) | null = null;

const parallaxSpec = ({ assets, base }: BackdropAutoInput): BackdropLayerSpec | null =>
  assets.depthUrl && base?.kind === "image" ? { id: "parallax", kind: "parallax", params: { strength: PARALLAX.strength } } : null;

const fogSpec = ({ assets, base }: BackdropAutoInput): BackdropLayerSpec | null =>
  assets.depthUrl && base?.kind === "image" ? { id: "depthFog", kind: "depthFog", params: { density: 1 } } : null;

export function startDepth(parallaxOn: () => boolean): () => void {
  if (stop) return stop;
  const cache = depthCache();
  const controller = new AbortController();
  const want = (base: BackdropBase | null) => {
    if (!base || base.kind !== "image" || !parallaxOn()) return;
    void cache.request(base.url, controller.signal).then((assets) => { if (assets) notifyAssetsChanged(base.key); }, () => undefined);
  };
  const offs = [
    registerAssetProvider({ id: "depth", lookup: async (base) => {
      if (base.kind !== "image" || !parallaxOn()) return null;
      const hit = cache.peek(base.url) ?? await cache.lookup(base.url, controller.signal).catch(() => null);
      if (!hit) want(base);
      return hit;
    } }),
    registerLayer("parallax", parallaxLayer, { gate: "parallax", auto: parallaxSpec }),
    registerLayer("depthFog", depthFogLayer, { gate: "parallax", auto: fogSpec }),
    onBaseShown(want),
  ];
  want(shownBase());
  stop = () => { controller.abort(); offs.forEach((off) => off()); stop = null; };
  return stop;
}
