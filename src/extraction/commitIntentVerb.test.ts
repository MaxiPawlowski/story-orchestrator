import { applyCommitEvidence, type CommitStory } from "./commitGuard";
import type { Quality } from "@engine/index";
import type { EvidenceMessage } from "./evidence";

const COMMIT_BASE = "take|takes|taking|took|taken|accept(?:s|ed|ing)?|sign(?:s|ed|ing)?|agree(?:s|d)?|agreeing|"
  + "commit(?:s|ted|ting)?|swear(?:s|ing)?|swore|sworn|pledge(?:s|d)?|vow(?:s|ed)?|enlist(?:s|ed)?|"
  + "choose(?:s)?|chose|chosen|sets? out|setting out|"
  + "we'?ll (?:go|do it|come|fight|ride|join|march|help)|i'?ll (?:go|do it|come|fight|ride|join|march|help)|"
  + "count (?:us|me) in|we'?re in|i'?m in|heads? (?:to|for|north|out)|"
  + "put (?:us|our names?|my name|the [a-z]+(?: [a-z]+)?) (?:down|in)|write (?:us|it|our names?|my name) (?:down|in)|"
  + "register(?:s|ed)? (?:us|me|our)|we ride|rides? (?:for|north|out|as)|"
  + "deal|it'?s a deal|that'?s a deal|you'?ve got (?:yourself )?a (?:deal|party)|agreed";

const boolQuality = (key: string, rubric: string, extra: string): Quality => ({
  key, type: "bool", source: "extractor", latching: true, rubric, commit_evidence: `\\b(?:${COMMIT_BASE}|${extra})\\b`,
});

const EAST_TRIGGERS = [
  "\\b(sign(?:s|ed)?|register|enter (?:the|as)|our names|join|accept(?:s|ed)?|agree(?:s|d)?)\\b",
  "\\b(sign(?:s|ed)?|register|enter (?:the|as)|our names|join|accept(?:s|ed)?|agree(?:s|d)?|fine,? we'?ll)\\b",
];
const AEGIS_TRIGGERS = [
  "\\b(sign(?:s|ed)?|the forms|exam forms|enter (?:us|the exam)|sit the exam|agree(?:s|d)?|accept(?:s|ed)?|put (?:us|our names?) down)\\b",
  "\\b(sign(?:s|ed)?|the forms|exam forms|sit the exam|fine,? we'?ll|all ?right,? we'?ll|agree(?:s|d)?|you win|put (?:us|our names?) down)\\b",
];

const storyOf = (quality: Quality, triggers: string[]): CommitStory => ({
  qualityByKey: { [quality.key]: quality },
  transitions: triggers.map((trigger, index) => ({
    from: `cp-${index}`, to: "next", priority: 1, gate: { q: quality.key, op: "==", v: true }, extractor_trigger: trigger,
  })),
});

const EAST = storyOf(boolQuality("east_entered", "Has the party signed the Jiansho Tournament register as Honami's group entry?",
  "enter|enters|entered|compete|fight for you"), EAST_TRIGGERS);
const AEGIS = storyOf(boolQuality("aegis_exam_entered", "Has the party put its names down for the C-rank promotion exam?",
  "we'?ll sit|i'?ll sit|sits? the exam"), AEGIS_TRIGGERS);

const npc = (speaker: string, text: string, messageId: number): EvidenceMessage => ({ messageId, text, isUser: false, speaker });
const player = (text: string, messageId: number): EvidenceMessage => ({ messageId, text, isUser: true, speaker: "Max Nightriver" });

const EAST_WINDOW = [
  npc("Megumi", "\"Welcome to Jiansho Academy! I'm Megumi Xianxu, Head of the Student Council.\" The smile is flawless; behind her back, "
    + "her hands are wringing the spine of a register book. \"And you must be Honami's... guests. How brave of you. Shall I read you "
    + "the rules before you sign, or after?\"", 8),
  npc("Adolion Narrator", "Students stop at the edges of the courtyard, whispering as the party passes.", 9),
  player("Read us the rules first, Council Head. Then we'll decide.", 10),
  npc("Megumi", "She opens the register and begins to read. *She looks up from the register.* \"Shall we sign now?\"", 11),
];
const AEGIS_WINDOW = [
  npc("Adolion Narrator", "The Guild hall in Aegis City has barely settled after the party's return when Vallie appears on the stairs "
    + "with an announcement: the Guild will put you forward for the C-rank exam. Domas follows her with the terms in writing, and Ellie "
    + "has already laid out the forms. Tobias watches from behind the counter. No one has put a pen in your hand yet.", 0),
];

const commits = (story: CommitStory, window: EvidenceMessage[], line: string, evidence = line): boolean => {
  const key = Object.keys(story.qualityByKey)[0];
  const messages = [...window, player(line, 99)];
  return applyCommitEvidence(story, [{ delta: { q: key, v: true, source: "extractor" }, evidence }], () => messages).accepted.length === 1;
};

describe("T1-4/T1-7: a commitment phrase that is itself the transition trigger still commits (v2.6 plan 15)", () => {
  it("T1-4 msg 12: \"We sign under Honami's name.\" commits east_entered", () => {
    expect(commits(EAST, EAST_WINDOW, "We sign under Honami's name. Where do we fight?")).toBe(true);
  });

  it("T1-7 msg 1: \"put our names down for the C-rank exam\" commits aegis_exam_entered, read from Vallie's answer", () => {
    expect(commits(AEGIS, AEGIS_WINDOW, "Vallie, put our names down for the C-rank exam.", "Done. You're on the list.")).toBe(true);
  });

  it.each([
    "Shall we sign under Honami's name?",
    "We won't sign under Honami's name.",
    "We sign nothing under Honami's name.",
    "Maybe we sign under Honami's name, maybe not.",
    "I sign the inn's guest ledger and look around.",
    "We'll sign later, after we eat.",
  ])("an east line that is no entry does not commit: %s", (line) => {
    expect(commits(EAST, EAST_WINDOW, line)).toBe(false);
  });

  it.each([
    "Should we put our names down for the C-rank exam?",
    "Don't put our names down for the C-rank exam yet.",
    "Put our names down for nothing until we have rested.",
    "I sign the tavern's tab for Tobias.",
  ])("an aegis line that is no entry does not commit: %s", (line) => {
    expect(commits(AEGIS, AEGIS_WINDOW, line)).toBe(false);
  });

  it("a window that never offered the entry does not let the trigger verb commit", () => {
    expect(commits(EAST, [npc("Belle", "Belle offers you a drink.", 1)], "We sign under Honami's name.")).toBe(false);
  });
});
