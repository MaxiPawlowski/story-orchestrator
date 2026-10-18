import type { StoredRead } from "./storedReads";

const INTERACTIVE = "a, button, input, textarea, select, label, [contenteditable]:not([contenteditable='false']), .mes_buttons, .mes_edit_buttons, .mes_edit, .mes_reasoning_details";

const bare = (text: string) => text.replace(/["*]/g, "");

export function passageTarget(event: MouseEvent): Element | null {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".mes_text") || event.detail > 1 || target.closest(INTERACTIVE)) return null;
  const selection = typeof window.getSelection === "function" ? window.getSelection() : null;
  return selection && !selection.isCollapsed ? null : target;
}

export function passageRead(target: Element, reads: StoredRead[]): StoredRead | undefined {
  const probe = bare((target.closest("p, q, em, i, span") ?? target).textContent?.trim() ?? "").slice(0, 24);
  return probe ? reads.find((read) => bare(read.at).includes(probe) || probe.includes(bare(read.at).slice(0, 24))) : undefined;
}
