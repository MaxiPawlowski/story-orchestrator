import { PUNCH_MS, SPRITE_HOP, SPRITE_PUNCH, SPRITE_REACTIONS, type SpriteMotion } from "./reactions";
import { reactionFor } from "../reactionMap";

type Animatable = Pick<Element, "animate" | "getAnimations">;

const running = new WeakMap<Animatable, Animation>();

export function playMotion(element: Animatable | null, motion: SpriteMotion, gain = 1): Animation | null {
  if (!element || typeof element.animate !== "function") return null;
  running.get(element)?.cancel();
  const animation = element.animate(motion.frames, { duration: motion.ms / Math.max(0.25, gain), easing: "ease-in-out" });
  running.set(element, animation);
  animation.addEventListener?.("finish", () => { if (running.get(element) === animation) running.delete(element); });
  return animation;
}

export const playReaction = (element: Animatable | null, label: string): Animation | null => {
  const id = reactionFor(label);
  const motion = id ? SPRITE_REACTIONS[id] : undefined;
  return motion ? playMotion(element, motion) : null;
};

export const playHop = (element: Animatable | null): Animation | null => playMotion(element, SPRITE_HOP);

export function playPunch(stage: Animatable | null, vignette: Animatable | null, mode: "shake" | "flash", shade: number): void {
  if (mode === "shake" && stage && typeof stage.animate === "function") stage.animate(SPRITE_PUNCH, { duration: PUNCH_MS, easing: "ease-out" });
  if (vignette && typeof vignette.animate === "function") {
    const peak = Math.min(0.7, shade + 0.35);
    vignette.animate([{ opacity: shade }, { opacity: peak, offset: 0.3 }, { opacity: shade }], { duration: 650, easing: "ease-out" });
  }
}

export function playTransition(cover: Animatable | null, iris: Animatable | null, kind: "fade" | "wipe" | "iris", ms: number): Animation | null {
  const timing = { duration: ms, easing: "ease-in-out" };
  if (kind === "iris") {
    if (!iris || typeof iris.animate !== "function") return null;
    return iris.animate([{ width: "160vmax", height: "160vmax", opacity: 1 }, { width: "0px", height: "0px", opacity: 1, offset: 0.45 }, { width: "0px", height: "0px", opacity: 1, offset: 0.55 },
      { width: "160vmax", height: "160vmax", opacity: 1 }], timing);
  }
  if (!cover || typeof cover.animate !== "function") return null;
  if (kind === "wipe") {
    return cover.animate([{ clipPath: "inset(0 100% 0 0)", opacity: 1 }, { clipPath: "inset(0 0 0 0)", opacity: 1, offset: 0.45 }, { clipPath: "inset(0 0 0 0)", opacity: 1, offset: 0.55 },
      { clipPath: "inset(0 0 0 100%)", opacity: 1 }], timing);
  }
  return cover.animate([{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], timing);
}

export function playBackgroundFade(layer: Animatable | null, ms: number, done: () => void): void {
  if (!layer || typeof layer.animate !== "function" || ms <= 0) return done();
  const animation = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-in-out", fill: "forwards" });
  animation.addEventListener?.("finish", done);
  animation.addEventListener?.("cancel", done);
}
