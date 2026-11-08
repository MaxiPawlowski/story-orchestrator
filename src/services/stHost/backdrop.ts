import type { WriteResult } from "@utils/writeResult";
import { readBackgroundLayer, watchBackgroundLayer } from "./backgroundLayer";
import { stillFromLayer, type BackdropStill } from "@backdrop/still";
import { parseCssColor, relativeLuminance } from "@backdrop/stage/contrast";

export type { BackdropStill };

export const BACKDROP_ROOT_ID = "so-backdrop-root";
export const BACKDROP_FLAGS = { active: "soBackdrop", dim: "soBackdropDim" } as const;

export const readBackdropStill = (): BackdropStill | null => stillFromLayer(readBackgroundLayer());

export const watchBackdropStill = (listener: (still: BackdropStill | null) => void): (() => void) =>
  watchBackgroundLayer((_previous, next) => listener(stillFromLayer(next)));

export const mountBackdropRoot = (): WriteResult<{ element: HTMLElement }> => {
  if (typeof document === "undefined") return { ok: false, reason: "no document" };
  const existing = document.getElementById(BACKDROP_ROOT_ID);
  if (existing) return { ok: true, element: existing };
  const background = document.getElementById("bg1");
  if (!background?.parentElement) return { ok: false, reason: "SillyTavern's background element #bg1 is missing" };
  const element = document.createElement("div");
  element.id = BACKDROP_ROOT_ID;
  element.setAttribute("aria-hidden", "true");
  background.insertAdjacentElement("afterend", element);
  return { ok: true, element };
};

export const unmountBackdropRoot = (): WriteResult => {
  if (typeof document === "undefined") return { ok: false, reason: "no document" };
  document.getElementById(BACKDROP_ROOT_ID)?.remove();
  return { ok: true };
};

export const setBackdropFlags = (flags: { active: boolean; dim: boolean }): WriteResult => {
  if (typeof document === "undefined") return { ok: false, reason: "no document" };
  const data = document.documentElement.dataset;
  if (flags.active) data[BACKDROP_FLAGS.active] = ""; else delete data[BACKDROP_FLAGS.active];
  if (flags.active && flags.dim) data[BACKDROP_FLAGS.dim] = ""; else delete data[BACKDROP_FLAGS.dim];
  return { ok: true };
};

export const chatColumnRect = (): { left: number; right: number } | null => {
  if (typeof document === "undefined") return null;
  const sheld = document.getElementById("sheld");
  if (!sheld) return null;
  const rect = sheld.getBoundingClientRect();
  return rect.width > 0 ? { left: rect.left, right: rect.right } : null;
};

export const chatTextLuminance = (): number | null => {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return null;
  const text = document.getElementById("chat");
  const color = text ? parseCssColor(getComputedStyle(text).color) : null;
  return color ? relativeLuminance(...color) : null;
};

export const hostIsGenerating = (): boolean => typeof document !== "undefined" && document.body?.dataset.generating === "true";

export const backdropReducedMotion = (): boolean => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const pageHidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden";

export const onPageVisibility = (listener: () => void): (() => void) => {
  if (typeof document === "undefined") return () => undefined;
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
};
