import { log } from "@utils/log";
import type { CoachAnchor } from "./coachTypes";

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Placement =
  | { mode: "sheet"; edge: "top" | "bottom" }
  | { mode: "center" }
  | { mode: "float"; side: "below" | "above" | "right" | "left" | "over"; top: number; left: number };

export type Found =
  | { state: "found"; element: HTMLElement; anchor: CoachAnchor }
  | { state: "hidden"; anchor: CoachAnchor }
  | { state: "missing" };

export const NARROW_WIDTH = 700;
export const RING_PAD = 6;
const GAP = 12;
const MARGIN = 16;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));

export const isNarrow = (viewport: Size) => viewport.width < NARROW_WIDTH;

export const isShown = (element: Element): boolean => {
  if (!element.getClientRects().length) return false;
  const check = (element as Element & { checkVisibility?: (options?: Record<string, boolean>) => boolean }).checkVisibility;
  return typeof check === "function" ? check.call(element, { visibilityProperty: true, opacityProperty: true }) : true;
};

const openDetails = (element: Element) => {
  const own = element.tagName === "SUMMARY" ? element.parentElement : null;
  for (let details = element.parentElement?.closest("details"); details; details = details.parentElement?.closest("details") ?? null) if (details !== own) details.open = true;
};

const query = (root: ParentNode, selector: string): HTMLElement | null => {
  try { return root.querySelector<HTMLElement>(selector); } catch (error) { log.warn("a tour stop names a selector the page cannot read", selector, error); return null; }
};

export const findTarget = (root: ParentNode, anchors: readonly CoachAnchor[], reveal = true): Found => {
  let hidden: CoachAnchor | null = null;
  for (const anchor of anchors) {
    const element = query(root, anchor.selector);
    if (!element) continue;
    if (reveal) openDetails(element);
    if (isShown(element)) return { state: "found", element, anchor };
    hidden ??= anchor;
  }
  return hidden ? { state: "hidden", anchor: hidden } : { state: "missing" };
};

export const boxOf = (element: Element): Box => {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
};

export const inView = (box: Box, viewport: Size) => box.top >= 0 && box.left >= 0 && box.top + box.height <= viewport.height && box.left + box.width <= viewport.width;

export const ringBox = (box: Box, viewport: Size): Box => {
  const top = clamp(box.top - RING_PAD, 0, viewport.height), left = clamp(box.left - RING_PAD, 0, viewport.width);
  const bottom = clamp(box.top + box.height + RING_PAD, top, viewport.height), right = clamp(box.left + box.width + RING_PAD, left, viewport.width);
  return { top, left, width: right - left, height: bottom - top };
};

export const place = (target: Box | null, bubble: Size, viewport: Size): Placement => {
  if (isNarrow(viewport)) return { mode: "sheet", edge: target && target.top + target.height / 2 > viewport.height * 0.55 ? "top" : "bottom" };
  if (!target) return { mode: "center" };
  const bottom = target.top + target.height + RING_PAD, right = target.left + target.width + RING_PAD;
  const centred = clamp(target.left + target.width / 2 - bubble.width / 2, MARGIN, viewport.width - MARGIN - bubble.width);
  const besideTop = clamp(target.top, MARGIN, viewport.height - MARGIN - bubble.height);
  if (bottom + GAP + bubble.height <= viewport.height - MARGIN) return { mode: "float", side: "below", top: bottom + GAP, left: centred };
  if (target.top - RING_PAD - GAP - bubble.height >= MARGIN) return { mode: "float", side: "above", top: target.top - RING_PAD - GAP - bubble.height, left: centred };
  if (right + GAP + bubble.width <= viewport.width - MARGIN) return { mode: "float", side: "right", top: besideTop, left: right + GAP };
  if (target.left - RING_PAD - GAP - bubble.width >= MARGIN) return { mode: "float", side: "left", top: besideTop, left: target.left - RING_PAD - GAP - bubble.width };
  return { mode: "float", side: "over", top: viewport.height - MARGIN - bubble.height, left: centred };
};

const modalSelector = () => typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("selector(:modal)");

const isModal = (dialog: Element) => modalSelector() && dialog.matches(":modal");

export const topModal = (doc: Document): HTMLElement => {
  const modals = Array.from(doc.querySelectorAll<HTMLDialogElement>("dialog[open]")).filter(isModal);
  return modals[modals.length - 1] ?? doc.body;
};
