export const SUGGESTION_SIDE_TEXT = {
  couldHelp: (label: string, hints: string) => `${label} — could help: ${hints}`,
  youHaveIt: (hint: string) => `${hint} (you have it)`,
  notYet: "Not yet",
  anchorFor: (text: string) => `for: ${text}`,
  author: (anchors: string, grounded: number, lines: number) => `Suggestions: anchors ${anchors || "none"}, grounded ${grounded}/${lines}`,
} as const;
