export const RECAP_GUIDE_TOPIC = {
  consequences: {
    title: "Consequences recap",
    fields: "recap, recap_when, player_action",
    text: "The chapter card, Overview and /story recap list up to five lines of what changed. recap on a transition, milestone or quest ({done, failed}) is a line or {text, because}: "
      + "text shows when the effect is visible; because only when the player's committed line decided it (one gate condition on a commit_evidence quality, nothing else open). "
      + "recap_when narrows it. player_action maps a committed enum/bool value to a clause (\"took the posting\"). Otherwise the line is neutral. Never name an unreached place.",
  },
} as const;
