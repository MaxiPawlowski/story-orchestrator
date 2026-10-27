import { JUDGE_USE_KEYS, JUDGE_USE_LABELS, type JudgeUseKey } from "./settings";

export interface JudgeUseCopy {
  label: string;
  description: string;
  sends: string;
}

const JUDGE_USE_DETAILS: Record<JudgeUseKey, Omit<JudgeUseCopy, "label">> = {
  canonVerify: {
    description: "Drops unsupported canon sentences before storing them. A missing judge keeps the existing synthesis path; verification runs off the reply path.",
    sends: "canon sentences, resolved arc summaries, live facts and current goal",
  },
  canonDraft: {
    description: "Enables the author's checked story-so-far draft action. The current canon stays in play until the author accepts the draft.",
    sends: "draft canon sentences, resolved arc summaries, live facts and current goal",
  },
  pictureCue: {
    description: "Filters cadence pictures and notices striking present-tense images. A missing judge keeps cadence; manual and turning-point pictures are unchanged.",
    sends: "the character reply",
  },
  adversityTrend: {
    description: "After 18 of 20 low-cost replies, offers a reviewed world-pressure note. Never chooses the player's loss or writes story state.",
    sends: "the character reply and player name, in a separate off-path call",
  },
  idleCheck: {
    description: "After 3 of 4 low-change, low-tension replies, offers a reviewed development hint. Its tension read is not yet compared with the memory model's.",
    sends: "the character reply, in a separate off-path call",
  },
  toneCheck: {
    description: "After 5 low-tone replies, offers a reviewed tone reminder; high tension skips it. Needs Nothing-happens trend for its tension read.",
    sends: "the character reply, story description and current goal, in a separate off-path call",
  },
  repetitionCheck: {
    description: "Offers a reviewed prose reminder when a phrase appears in at least 4 replies. Pure English phrase mining; no judge calls.",
    sends: "nothing: reads up to 60 replies locally",
  },
  director: {
    description: "Picks who speaks next in a group chat when the turning point has talk control. Needs a one-line role for every character in the pool; otherwise the usual director decides.",
    sends: "the last 8 messages, character names and roles, the scene name and goal",
  },
  memoryVerify: {
    description: "Drops notes the story never showed and down-weights doubtful ones.",
    sends: "the read's messages, the candidate notes, story title and cast names",
  },
  memoryPairs: { description: "Decides whether two similar notes are a duplicate, an update, or both true.", sends: "two memory notes per question" },
  sceneTrigger: {
    description: "Asks for the scene read on the turn a scene changes, next to today's keyword check.",
    sends: "the last 8 messages, the turning point's name and goal, cast names and roles, your persona name",
  },
  sceneTracker: {
    description: "Keeps location, time and who is present, and adds them to the prompt.",
    sends: "the last 8 messages, the turning point's name and goal, cast names and roles, your persona name, the story's locations",
  },
  lookahead: {
    description: "Shows which upcoming turning points play is moving toward.",
    sends: "the last 8 messages and the names and goals of the next turning points",
  },
  loreSelect: {
    description: "Adds the lore entries that matter to the next reply, even without their keywords.",
    sends: "the last 8 messages, the turning point's name and goal, and the title and text of each entry in the story's lore-select books",
  },
  curatorFilter: { description: "Shows the World Info curator only the entries the story may have overtaken.", sends: "the story so far and the story's lore entries" },
  typedExtraction: {
    description: "Reads the tracked values the author marked for it on every turn, so turning points open sooner; the rest stay with the story model.",
    sends: "the last 3 messages (or the read's window), the story title and turning point, and each marked value's description, values and numbers or names found in the messages",
  },
  stallCheck: {
    description: "Checks a stuck way forward before spending a full re-read; writes only what the messages clearly show.",
    sends: "the messages since the turning point began and the unmet conditions' descriptions and values",
  },
  expansionCritic: {
    description: "Reviews generated story beats instead of a second model call; the code checks still run first.",
    sends: "up to 40 established facts, the target turning point's name and goal, cast names with your persona, the tension trajectory and the generated beats",
  },
  expansionLookahead: {
    description: "Writes the generated beats one turning point ahead, where play is heading, before the story gets there.",
    sends: "nothing beyond Heading toward and the expansion itself (reviewed by Expansion review when that is on)",
  },
  agencyCheck: {
    description: "After a character reply, asks whether it wrote what only you do, say or decide; when it did, the next reply's prompt carries one line leaving your part to " +
      "you. Uses the continuity warden's review or auto mode.",
    sends: "the character reply, your latest message and your persona name",
  },
  houseRules: {
    description: "After a character reply, checks it against the story's house rules; a broken rule is named in the next reply's prompt. Uses the continuity warden's review or auto mode.",
    sends: "the character reply and the story's house rules",
  },
  wardenLore: {
    description: "After a character reply, checks it against the story's own lore entries that fired for that reply; a contradicted entry is named in the next reply's prompt. " +
      "Needs the continuity warden on, and uses its review or auto mode.",
    sends: "the character reply and the title and text of up to 8 story lore entries that fired for it (600 characters each); never memory or other books",
  },
  loreExclusive: {
    description: "For a story marked exclusive, switches off, for that one reply, the entries of its lore-select books the judge did not pick. Only with per-chat gating; " +
      "a timeout, a refused pick or a timed entry keeps the keyword scan as it is.",
    sends: "nothing beyond Lore selection: it acts on the same request",
  },
  expressions: {
    description: "Reads each passage of a reply as it streams and picks which character it is about and their facial expression, for the sprite stage. " +
      "Otherwise the sprite model, then the local classifier, decide.",
    sends: "each reply's passages, the on-stage character names and the expression labels with their descriptions",
  },
  attentionCheck: {
    description: "After a character reply, asks whether it answered what you just said or did; a reply that passed over it gets a one-line reminder in the next reply's prompt. " +
      "A refusal or an in-character dodge counts as an answer. Passed its synthetic fixture twice.",
    sends: "nothing beyond the warden's call: the character reply, your latest message and your persona name",
  },
  divergence: {
    description: "At each turn of a turning point with ways forward, asks whether what you are doing fits any of them; two answers of \"none\" in a row, or one very sure one, "
      + "let the story director write a branch that follows you and later comes back. Not measured yet.",
    sends: "the last six chat messages, your persona name and a one-line description of each way forward from the current turning point",
  },
  wardenVoice: {
    description: "After a character reply, asks whether it sounds like that character, against their role, drive and feelings; a reply that does not gets a one-line note "
      + "in the next reply's prompt, never a rewrite. Not measured yet.",
    sends: "the character reply, the speaker's name, roster role and drive, and their feelings toward the others in the scene",
  },
};

export const JUDGE_USE_COPY = Object.fromEntries(JUDGE_USE_KEYS.map((key) => [key, { label: JUDGE_USE_LABELS[key], ...JUDGE_USE_DETAILS[key] }])) as Record<JudgeUseKey, JudgeUseCopy>;
