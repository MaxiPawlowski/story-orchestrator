import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { settingsAt } from "./where";

export const MECHANICS_FEATURES: readonly Feature[] = [
  {
    id: "seeded-lore-chance", name: "Same lore on a swipe", area: "world", audience: "author",
    oneLine: "A story lorebook entry with a trigger chance gives the same answer for every swipe and replay of one turn.",
    what: "SillyTavern rolls an entry's trigger chance afresh on every generation, so a swipe could get different lore than the reply it replaces. For the "
      + "lorebooks of the story this chat plays, the extension decides that chance once per turn from a seed, on the scan copy only; the lorebook file is not "
      + "changed. Sticky entries keep SillyTavern's own roll. Inclusion groups that pick at random are named in Repair. No model call.",
    where: settingsAt("#so-wi-seeded-chance", "World & lore › Same lore on a swipe"),
    settings: ["worldInfo.seededChance"], doc: "setup/settings-reference.md", status: "shipped", needs: ["story"],
  },
  {
    id: "cross-voice-trim", name: "Cut lines written for someone else", area: "characters", audience: "player",
    oneLine: "A reply that goes on to write another character's lines, or yours, is cut where those lines begin.",
    what: "Characters in a group sometimes keep writing after their own part, adding a line headed with another character's name or yours. "
      + "Right after the reply arrives, before the story reads it, the reply is cut at the first such line. A reply that would be left nearly empty "
      + "is kept as written and noted in the story log. Thinking is never changed. No model call.",
    where: settingsAt("#so-cross-voice-trim", "Speaker direction › Cut lines written for someone else"),
    settings: ["talk.crossVoiceTrim"], doc: "setup/settings-reference.md", status: "shipped", needs: ["group-chat", "story"],
  },
  {
    id: "dry-names", name: "Protect names from the repetition penalty", area: "characters", audience: "player",
    oneLine: "The DRY repetition penalty no longer bends the cast's names into misspellings.",
    what: "DRY penalises repeating a stretch of text it has seen before, and a name the story uses often can come out misspelled. For each reply in "
      + "the story's chat, the cast's names, their given names and aliases and your name are added to the request's own DRY sequence breakers. "
      + "Only when the request already uses DRY (Text Completion); your preset is not changed.",
    where: settingsAt("#so-dry-names", "Speaker direction › Protect names from the repetition penalty"),
    settings: ["talk.dryNames"], doc: "setup/settings-reference.md", status: "shipped", needs: ["group-chat", "story"],
  },
  {
    id: "lore-budget-evidence", name: "Lore cut by the budget", area: "world", audience: "author",
    oneLine: "Records which story lore entries matched but did not fit SillyTavern's lore budget, and warns when the budget has no cap.",
    what: "Each reply's World Info scan is watched, read only. A story lorebook entry that matched but was cut because the lore budget ran out is "
      + "listed in the Author console under Cut by budget, and Repair names it once it is cut in 2 of the last 10 replies, with the book that used "
      + "the budget. Repair also notes when SillyTavern's lore budget has no cap and this story's lorebooks are large. Nothing is changed for you.",
    where: settingsAt("#so-wi-budget-evidence", "World & lore › Record lore cut by the budget"),
    settings: ["worldInfo.budgetEvidence"], doc: "setup/settings-reference.md", status: "shipped", needs: ["story"],
  },
  {
    id: "lore-lexical", name: "Word-match lore", area: "world", audience: "author",
    oneLine: "Matches lore entries against the recent chat by their words: a fallback when the judge is silent, a shortlist for the judge and a tie-break.",
    what: "A word-match score (BM25 over each entry's title, keys and text against the recent chat, the newest line counting double) helps lore "
      + "selection three ways, each with its own switch: when the judge cannot answer, the two best matches are forced instead of none; with more "
      + "than 12 entries, the judge is asked only about the 12 best matches (off by default: it dropped about half of the judge's picks); "
      + "and when the judge rates two entries the same, the better match goes first. No model call.",
    where: settingsAt("#so-wi-lexical-fallback", "World & lore › Word-match lore when the judge is silent"),
    settings: ["worldInfo.lexicalFallback", "worldInfo.lexicalPrefilter", "worldInfo.lexicalTiebreak"], doc: "setup/settings-reference.md", status: "shipped", needs: ["story"],
  },
  {
    id: "lore-hold-round", name: "Keep the lore picks for a round", area: "world", audience: "author",
    oneLine: "Lore is chosen once per message of yours and kept while the other characters reply.",
    what: "Before, the judge was asked about lore before every character's reply. Now its answer is kept for the round, until your next message, a "
      + "change of checkpoint, or a lore entry newly named in the chat. Each character still gets only the entries meant for them. Fewer judge calls.",
    where: settingsAt("#so-wi-hold-round", "World & lore › Keep the lore picks for a round"),
    settings: ["worldInfo.holdRound"], doc: "setup/settings-reference.md", status: "shipped", needs: ["story"],
  },
  {
    id: "lore-prefer-known", name: "Prefer lore you have met", area: "world", audience: "author",
    oneLine: "Lore about people, places and things you have not met ranks a little lower.",
    what: "An entry that names someone or something in the story's codex you have not met yet loses a little of the judge's rating before the cut, and "
      + "is never forced by word match alone. Characters may still know it; this only makes it less likely to be put in front of them.",
    where: settingsAt("#so-wi-prefer-known", "World & lore › Prefer lore you have met"),
    settings: ["worldInfo.preferKnown"], doc: "setup/settings-reference.md", status: "shipped", needs: ["story"],
  },
  {
    id: "path-arc", name: "Pace by the road ahead", area: "authoring", audience: "author",
    oneLine: "The dramatic shape follows the turning points left on the way to an ending, and eases off after a climax.",
    what: "Where a beat has no tension target of its own, the story's dramatic shape is read at how far along the road the chat is: the turning points already "
      + "passed against those left on the shortest way to an ending, plus how long the current scene has run against its target length. It never goes back. "
      + "After the tension stayed critical for two readings and then fell, the pacing note does not push for more for three replies, unless the beat is "
      + "written as the peak. No model call. Not rated yet.",
    where: settingsAt("#so-authoring-path-arc", "Authoring › Prompt trials"),
    settings: ["pacing.pathArc"], guideTopic: "tension", doc: authorGuideDoc("tension"), status: "shipped", needs: ["story"],
  },
  {
    id: "stuck-ladder", name: "Help a stuck player with leads", area: "authoring", audience: "author",
    oneLine: "A gated scene that has stopped moving gets its authored leads one at a time, as world pressure.",
    what: "When no quality an exit of the current scene reads has changed for the scene's stuck_after player turns (6 by default), the narrator's private "
      + "direction carries the scene's first lead as something the world may make available; every three more quiet turns, the next lead; past the last one, "
      + "a general nudge toward the objective. Any change to a watched quality starts the count again. It never moves the story on and makes no model call. "
      + "Not rated yet.",
    where: settingsAt("#so-authoring-stuck-ladder", "Authoring › Prompt trials"),
    settings: ["pacing.stuckLadder"], guideTopic: "stuck-leads", doc: authorGuideDoc("stuck-leads"), status: "shipped", needs: ["story"],
  },
];
