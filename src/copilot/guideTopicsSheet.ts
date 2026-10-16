export const SHEET_GUIDE_TOPICS = {
  "widget-scene": {
    title: "Scene card",
    fields: "kind scene, options.time",
    text: "kind scene: a player card with where (the location the Overview shows), when (only with options.time true and a clock) and \"With you\": enabled members not away, "
      + "only those the player has met (a member with its own People entry is listed once that entry is known), never the narrator. Each name links to its People page and shows the card's "
      + "portrait or initials. An unmet member is not on the card at all: no name, picture or count. \"With you\" means in the scene's cast, not seen in the room. The author places it.",
  },
  "display-narrate": {
    title: "The sheet reaches the narrator",
    fields: "display.narrate",
    text: "display.narrate: \"omniscient\" (the default) or false. A public quality's sheet line (the player's own words: item, count, band word) goes only into the private block of "
      + "omniscient members (view omniscient) on their own turns, never to other characters; false keeps it out. The narrator also gets \"just happened\" lines: visible quest moves, "
      + "earned milestones (never secret ones) and band changes since its last request. Withheld on quiet and impersonate. \"everyone\" is refused: what the player sees is not known to all.",
  },
  "display-warn": {
    title: "Warning bands",
    fields: "bands[].warn",
    text: "bands [{max, label, warn?}]: warn (80 characters) on a public meter's band shows a chip on the Stat sheet while the value sits in that band, and the narrator gets the same line. "
      + "Not on faction bands (refused) or relationships (never public). Write it as the player's warning (\"One more wound could kill you.\"), never a number.",
  },
} as const;
