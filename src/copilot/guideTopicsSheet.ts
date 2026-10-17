export const SHEET_GUIDE_TOPICS = {
  "widget-scene": {
    title: "Scene card",
    fields: "kind scene, options.time, options.standing",
    text: "kind scene: a player card: where (the Overview's location), when (options.time true and a clock), \"With you\": enabled members not away whom the player has met "
      + "(own People entry known), never the narrator; each with portrait or initials and a People link. An unmet member is not on it at all. Under a name: its People-page "
      + "labels toward you or someone on the card (a secret only once revealed, as \"Learned\"); options.standing true adds the band of each visible group it belongs to "
      + "(this tells who belongs where). No trend or change mark. The author places it.",
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
