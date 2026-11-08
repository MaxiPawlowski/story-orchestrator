import type { BackdropAutoInput, BackdropBaseModifier, BackdropFrame, BackdropLayer, BackdropLayerContext, BackdropLayerSpec } from "../types";
import { CINEMAGRAPH_PERIOD_S } from "./cinemagraphFlow";

export const CINEMAGRAPH_KIND = "cinemagraph";
export const CINEMAGRAPH_ORDER = -90;

export const cinemagraphWeight = (frame: Pick<BackdropFrame, "reducedMotion" | "intensity">): number =>
  frame.reducedMotion ? 0 : Math.min(1, Math.max(0, 0.6 + frame.intensity * 0.4));

export function cinemagraphAuto(input: BackdropAutoInput): BackdropLayerSpec | null {
  const tier = input.settings.loops;
  if (tier === "off" || !input.base || input.base.kind !== "image" || !input.assets.maskUrl || input.assets.loopUrl) return null;
  return { id: CINEMAGRAPH_KIND, kind: CINEMAGRAPH_KIND, params: {} };
}

export function cinemagraphLayer(context: BackdropLayerContext): BackdropLayer {
  let mask: WebGLTexture | null = null;
  let disposed = false;
  const maskUrl = context.assets.maskUrl;
  if (maskUrl) void context.texture(maskUrl).then((texture) => { if (!disposed) mask = texture; });
  return {
    kind: CINEMAGRAPH_KIND,
    order: CINEMAGRAPH_ORDER,
    fps: 30,
    usesAssets: true,
    modifyBase(frame: BackdropFrame): BackdropBaseModifier | null {
      const strength = cinemagraphWeight(frame);
      if (!mask || strength <= 0) return null;
      return { flow: { texture: mask, strength, time: frame.time, period: CINEMAGRAPH_PERIOD_S } };
    },
    draw: () => undefined,
    dispose() { disposed = true; },
  };
}
