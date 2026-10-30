import type { KeyboardEvent } from "react";

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

export const rovingTarget = (key: string, current: number, count: number, axis: "horizontal" | "vertical" | "both" = "both"): number | null => {
  if (!count) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const allowed = axis === "both" || (axis === "horizontal" ? key === "ArrowLeft" || key === "ArrowRight" : key === "ArrowUp" || key === "ArrowDown");
  const step = allowed ? STEP[key] : undefined;
  if (step === undefined) return null;
  return ((current < 0 ? 0 : current) + step + count) % count;
};

export const roveWithin = (event: KeyboardEvent<HTMLElement>, selector: string, axis: "horizontal" | "vertical" | "both" = "both"): boolean => {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(selector)).filter((item) => !item.hasAttribute("disabled"));
  const focused = items.findIndex((item) => item === document.activeElement);
  const current = focused >= 0 ? focused : items.findIndex((item) => item.getAttribute("aria-selected") === "true" || item.getAttribute("aria-checked") === "true");
  const next = rovingTarget(event.key, current, items.length, axis);
  if (next === null) return false;
  event.preventDefault();
  items[next].focus();
  items[next].click();
  return true;
};
