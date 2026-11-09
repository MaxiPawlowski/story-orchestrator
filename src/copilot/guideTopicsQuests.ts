export const QUEST_GUIDE_TOPICS = {
  quests: {
    title: "Quests and milestones",
    fields: "quests[], visible_when, offered_when, done_when, failed_when, steps[], optional, alternative_of, requires, progress, labels, giver, reward, promise, milestones[]",
    text: "Lifecycle is computed every turn: hidden until visible_when (the acceptance), offered while offered_when holds, then active; it closes once on a resolution and latches. "
      + "done_when is the resolution done, failed_when the resolution failed (failed wins), reward a consequence of done. done_when defaults to every required step: optional steps are "
      + "skipped, alternative_of groups need one. requires: an id (its done) or {quest, resolution: [ids]}. Milestones {id, title, when, secret}.",
  },
  "quest-resolutions": {
    title: "Quest resolutions",
    fields: "resolutions[], id, when, label, recap, from, precedence, hold_when_ambiguous, quest_<id>_closed",
    text: "resolutions [{id, when, label, recap, from, consequences}] name how a quest can end, beside done and failed; label is player copy shown only once reached. "
      + "from [active] by default; offered lets the player decline. Time alone never closes an offered quest, except a neutral id lapsed. Two endings that can both hold need "
      + "precedence [ids], first wins, unless one key's literals tell them apart; hold_when_ambiguous keeps the quest open instead. Gates read quest_<id>_closed (== or in).",
  },
  "quest-consequences": {
    title: "Quest consequences",
    fields: "consequences[], when, set, effects, label, visible_when",
    text: "consequences [{id, when, set, effects, label, visible_when}] apply once, at the close, read against that boundary: when is the method clause (\"if violence was used\"); "
      + "false then, never later. set writes declared code qualities (adds summed once, never faction standing: gate a faction move on the resolution); effects switch world_info, "
      + "cast_changes, npc_replies (onEnter). The player sees label once applied and visible_when holds. Other quests see them next boundary.",
  },
} as const;
