import { applyCommitEvidence, type CommitStory } from "./commitGuard";
import type { Quality } from "@engine/index";
import type { EvidenceMessage } from "./evidence";

const COMMIT = "\\b(?:take|takes|taking|took|taken|accept(?:s|ed|ing)?|sign(?:s|ed|ing)?|agree(?:s|d)?|agreeing|commit(?:s|ted|ting)?|choose(?:s)?|chose|we'?ll (?:go|do it|come|ride|join)|i'?ll (?:go|do it|come|ride|join)|count (?:us|me) in|we'?re in|i'?m in|heads? (?:to|for|north|out))\\b";

const path: Quality = {
  key: "path", type: "enum", values: ["wendhope"], source: "extractor", latching: true, rubric: "Which posting has the party committed to?", commit_evidence: COMMIT,
};

const story: CommitStory = {
  qualityByKey: { path },
  transitions: [{ from: "guild-hall", to: "road-to-wendhope", priority: 1,
    gate: { all: [{ q: "path", op: "==", v: "wendhope" }, { q: "party_name", op: "!=", v: "" }] },
    extractor_trigger: "\\b(take|accept|sign|grab|choose|go|head)\\b.*\\b(wendhope|mining village|posting|quest|job)\\b" }],
};

const narrator = (text: string): EvidenceMessage => ({ messageId: 0, text, isUser: false, speaker: "Adolion Narrator" });
const player = (text: string): EvidenceMessage => ({ messageId: 1, text, isUser: true, speaker: "Max" });
const BOARD = narrator("Tobias taps the board: the Wendhope posting, D-rank, investigate the silent mining village.");

const commits = (line: string, context: EvidenceMessage[] = [BOARD]) =>
  applyCommitEvidence(story, [{ delta: { q: "path", v: "wendhope", source: "extractor" }, evidence: "Your posting." }], () => [...context, player(line)]).accepted.length === 1;

describe("commit evidence reads refusals and unrelated uses as no commitment", () => {
  it.each([
    "We won't take it.",
    "We will not accept the Wendhope job.",
    "No, we don't agree.",
    "I'd never take that job.",
    "We won’t take the Wendhope posting, not for that money.",
    "I refuse to sign anything for Wendhope.",
    "We can't take Wendhope. Not now.",
  ])("a refusal with a commitment verb does not commit: %s", (line) => {
    expect(commits(line)).toBe(false);
  });

  it.each([
    "I'll take a seat.",
    "I take a long drink and look around the hall.",
    "We'll go to the bar first.",
  ])("an unrelated use of a commitment verb does not commit: %s", (line) => {
    expect(commits(line)).toBe(false);
  });

  it.each([
    "Fine, we'll do it. Ash Lanterns. Let's ride north.",
    "This one. We take Wendhope. Write us down as the Ash Lanterns.",
    "So that's settled, we take the Wendhope job.",
    "We'll take the Wendhope job.",
    "Count us in.",
    "No, not that one. We take Wendhope.",
    "I won't lie, it scares me, but we accept the posting.",
  ])("a genuine acceptance still commits: %s", (line) => {
    expect(commits(line)).toBe(true);
  });

  it("an anaphoric acceptance needs the window to be about the posting at all", () => {
    expect(commits("Fine, we'll do it.", [narrator("Belle offers you a drink.")])).toBe(false);
  });

  it("a quality with no value words and no transition intent keeps the verb-only rule, negation still applies", () => {
    const sworn: CommitStory = { qualityByKey: { oath: { ...path, key: "oath", type: "bool", values: undefined, commit_evidence: "\\b(swear|take the oath)\\b" } }, transitions: [] };
    const read = (line: string) => applyCommitEvidence(sworn, [{ delta: { q: "oath", v: true, source: "extractor" }, evidence: line }], () => [player(line)]).accepted.length;
    expect(read("I swear it.")).toBe(1);
    expect(read("I will never swear to the Crown.")).toBe(0);
  });
});
