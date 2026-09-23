// V19: the keyboard-only authoring pass needs real key presses, because a simulated Tab (user-event in
// Storybook) does not walk the Studio's graph panel the way a browser does. A walk is the list of
// controls focus landed on, one per Tab; this says whether it reached every control it must and never
// left the dialog.

export interface FocusStop {
  label: string;
  insideDialog: boolean;
}

export interface FocusWalkVerdict {
  ok: boolean;
  missing: string[];
  escapedAt: number | null;
  wrapped: boolean;
}

export function focusWalkVerdict(walk: FocusStop[], required: string[]): FocusWalkVerdict {
  const seen = new Set(walk.map((stop) => stop.label));
  const missing = required.filter((label) => !seen.has(label));
  const escapedIndex = walk.findIndex((stop) => !stop.insideDialog);
  const first = walk[0]?.label;
  const wrapped = first !== undefined && walk.slice(1).some((stop) => stop.label === first);
  return { ok: missing.length === 0 && escapedIndex === -1 && wrapped, missing, escapedAt: escapedIndex === -1 ? null : escapedIndex, wrapped };
}
