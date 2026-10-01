import { applyCommitEvidence, type CommitStory } from "./commitGuard";
import type { PrimitiveValue, Quality } from "@engine/index";
import type { EvidenceMessage } from "./evidence";
import type { ParsedDelta } from "./types";

const COMMIT_T0 = "\\b(?:take|takes|taking|took|taken|accept(?:s|ed|ing)?|sign(?:s|ed|ing)?|agree(?:s|d)?|agreeing|"
  + "commit(?:s|ted|ting)?|swear(?:s|ing)?|swore|sworn|pledge(?:s|d)?|vow(?:s|ed)?|enlist(?:s|ed)?|"
  + "choose(?:s)?|chose|chosen|sets? out|setting out|"
  + "we'?ll (?:go|do it|come|fight|ride|join|march|help)|i'?ll (?:go|do it|come|fight|ride|join|march|help)|"
  + "count (?:us|me) in|we'?re in|i'?m in|heads? (?:to|for|north|out)|put (?:us|our names?|my name) down)\\b";

const COMMIT_T1 = "\\b(?:take|takes|taking|took|taken|accept(?:s|ed|ing)?|sign(?:s|ed|ing)?|agree(?:s|d)?|agreeing|"
  + "commit(?:s|ted|ting)?|swear(?:s|ing)?|swore|sworn|pledge(?:s|d)?|vow(?:s|ed)?|enlist(?:s|ed)?|"
  + "choose(?:s)?|chose|chosen|sets? out|setting out|"
  + "we'?ll (?:go|do it|come|fight|ride|join|march|help)|i'?ll (?:go|do it|come|fight|ride|join|march|help)|"
  + "count (?:us|me) in|we'?re in|i'?m in|heads? (?:to|for|north|out)|"
  + "put (?:us|our names?|my name|the [a-z]+(?: [a-z]+)?) (?:down|in)|write (?:us|it|our names?|my name) (?:down|in)|"
  + "register(?:s|ed)? (?:us|me|our)|we ride|rides? (?:for|north|out|as)|"
  + "deal|it'?s a deal|that'?s a deal|you'?ve got (?:yourself )?a (?:deal|party)|agreed)\\b";

const pathQuality = (pattern: string): Quality => ({
  key: "path", type: "enum", values: ["wendhope"], source: "extractor", latching: true, rubric: "Which posting has the party committed to?", commit_evidence: pattern,
});
const partyName: Quality = { key: "party_name", type: "string", source: "extractor", latching: true, rubric: "What name is the party registered under?" };

const TRIGGER = "\\b(take|accept|sign|grab|choose|go|head)\\b.*\\b(wendhope|mining village|posting|quest|job)\\b";
const STEWARD_TRIGGER = "\\b(take (?:it|the job|the posting|the contract)|we'?ll take|accept(?:s|ed)?|sign(?:s|ed)?|(?:it'?s a|you have a) deal|we'?ll go|head(?:ing)? (?:out|north|for)|set(?:ting)? out)\\b|\\bwendhope\\b";
const storyWith = (pattern: string): CommitStory => ({
  qualityByKey: { path: pathQuality(pattern), party_name: partyName },
  transitions: [
    { from: "guild-hall", to: "road-to-wendhope", priority: 1, gate: { all: [{ q: "path", op: "==", v: "wendhope" }, { q: "party_name", op: "!=", v: "" }] }, extractor_trigger: TRIGGER },
    { from: "adv-guild-tavern", to: "road-to-wendhope", priority: 1, gate: { all: [{ q: "path", op: "==", v: "wendhope" }, { q: "party_name", op: "!=", v: "" }] }, extractor_trigger: TRIGGER },
    { from: "the-sheridan-steward", to: "road-to-wendhope", priority: 1, gate: { all: [{ q: "path", op: "==", v: "wendhope" }, { q: "party_name", op: "!=", v: "" }] }, extractor_trigger: STEWARD_TRIGGER },
  ],
});

const narrator = (text: string): EvidenceMessage => ({ messageId: 0, text, isUser: false, speaker: "Adolion Narrator" });
const player = (text: string): EvidenceMessage => ({ messageId: 9, text, isUser: true, speaker: "Max" });
const OFFER = narrator("Tobias taps the board: the Wendhope posting, D-rank, investigate the silent mining village. The Sheridans pay double the usual fee.");

interface Case { line: string; party?: string; npc?: string }

const ACCEPT: Case[] = [
  { line: "I set my mug down and walk back to the counter. Tobias. Fine. Triple the fee, and we ride as the Ash Lanterns.", party: "Ash Lanterns" },
  { line: "Ash Lanterns, Belle. Both words. Tobias, Ellie: write us in for Wendhope as the Ash Lanterns, at triple the fee.", party: "Ash Lanterns" },
  { line: "Double it is, then. We take the Wendhope posting. Belle, Dalan, Talis, get your gear, we leave at first light." },
  { line: "I lead the other two back to the counter and slap the Wendhope notice down in front of Tobias. We'll take the Wendhope job." },
  { line: "We'll buy rope and lanterns on the way out. Ellie, you've had that pen ready all morning. Put us down as the Ash Lanterns.", party: "Ash Lanterns" },
  { line: "I push through the crowd to the board and tap the Wendhope posting. \"This one. We take Wendhope. Write us down as the Ash Lanterns.\"", party: "Ash Lanterns" },
  { line: "I sigh and look back at the board. \"Fine, we'll do it. Ash Lanterns. Let's ride north.\"", party: "Ash Lanterns" },
  { line: "\"So that's settled — we take the Wendhope job.\" I check the straps on my pack as the road bends north past the last farms." },
  { line: "I am. *I walk to the counter and tap the notice Tobias keeps poking at.* Tobias, we'll take the Wendhope job. The three of us, if these two are in." },
  { line: "We're sure. Write it down. *I turn to Ellie with her inked pen.* Put us in the book as the Grey Pennants.", party: "Grey Pennants" },
  { line: "We'll take Wendhope." },
  { line: "We take Wendhope. Write us down as the Ash Lanterns.", party: "Ash Lanterns" },
  { line: "Fine. Triple the fee, and we ride as the Ash Lanterns.", party: "Ash Lanterns" },
  { line: "Sign us up for Wendhope, Tobias." },
  { line: "Count us in. Wendhope it is." },
  { line: "Deal. We'll head north for Wendhope at dawn." },
  { line: "Agreed. Tobias, the job is ours." },
  { line: "Fine, we'll go. Wendhope it is." },
  { line: "All right, Tobias, you win. We'll take it." },
  { line: "We accept the posting." },
  { line: "Put our names down for the Wendhope job." },
  { line: "We'll do it. Write us down." },
  { line: "You've got yourself a party, Tobias. We're in." },
  { line: "It's a deal. Ash Lanterns, D-rank, Wendhope.", party: "Ash Lanterns" },
  { line: "Write us in, Ellie. The Ash Lanterns take Wendhope.", party: "Ash Lanterns" },
  { line: "Triple the fee and we'll ride for Wendhope." },
  { line: "For that fee, we'll ride." },
  { line: "Done haggling. Ellie, the Ash Lanterns are taking the Wendhope posting.", party: "Ash Lanterns" },
  { line: "Alright, we're in. When do we leave for Wendhope?" },
  { line: "Very well. We'll take the job, Tobias." },
  { line: "Pay us triple and the Ash Lanterns ride for Wendhope.", party: "Ash Lanterns" },
  { line: "Sign us up. We'll leave at first light." },
  { line: "Fine. Wendhope. Sign us up before I change my mind." },
  { line: "Put the Grey Pennants down for Wendhope.", party: "Grey Pennants" },
  { line: "We'll take Wendhope. Somebody has to find out what happened up there." },
  { line: "The Ash Lanterns accept, Tobias. Triple the fee, as you said.", party: "Ash Lanterns" },
  { line: "Ellie, register us for the Wendhope posting." },
  { line: "We'll go to Wendhope." },
  { line: "Fine, fine. We'll do it, but you're buying the first round when we're back." },
  { line: "Hand me the quill. I'll sign for Wendhope." },
  { line: "Fine, Tobias. We'll help you." },
  { line: "Deal, Tobias." },
  { line: "Tobias, we agreed to the Wendhope job last night. Hand over the notice." },
  { line: "At triple the fee, the Grey Pennants ride north tomorrow.", party: "Grey Pennants" },
];

const REFUSE: Case[] = [
  { line: "A collapsed mine shaft for that pay? No. We'll find something else." },
  { line: "Twice the pay for a dead mine. Who are the Sheridans, and what do they think is up there?" },
  { line: "What's the job on the board with the red seal?" },
  { line: "Yes, Ellie, what else is there? And Tobias, tell the Sheridans to hire soldiers if they think something's up there." },
  { line: "Hm. Maybe. Maybe the merchant job. Or maybe not. Belle, Dalan, what do you two think?" },
  { line: "Come on, you two. We'll be in the tavern if anyone has a real job." },
  { line: "We find a table in the tavern and order three ales. Anyone here hiring?" },
  { line: "I raise my mug to the scarred man nursing his ale. You look like you've been around. Any work in here that isn't a dead mine?" },
  { line: "I push through the crowd to the board and read the Wendhope posting twice. \"Actually, no. Not for that money. Something's wrong with a village that pays that much to be found.\"" },
  { line: "Tobias, what's the catch with the Wendhope posting? Nobody pays that much for a collapsed mine." },
  { line: "We won't take it." },
  { line: "We will not accept the Wendhope job." },
  { line: "No, we don't agree." },
  { line: "I'd never take that job." },
  { line: "We won’t take the Wendhope posting, not for that money." },
  { line: "I refuse to sign anything for Wendhope." },
  { line: "We can't take Wendhope. Not now." },
  { line: "I'll take a seat." },
  { line: "I take a long drink and look around the hall." },
  { line: "We'll go to the bar first." },
  { line: "I'll take you to the bar, Belle, and we talk there." },
  { line: "Should we take the Wendhope job?" },
  { line: "Maybe we'll take Wendhope, maybe not. Let me think." },
  { line: "I'll take the merchant job instead." },
  { line: "That's a bad deal, Tobias." },
  { line: "No deal. Find someone else for Wendhope." },
  { line: "Write us in for Wendhope? Not a chance." },
  { line: "If the pay were triple, we might take the Wendhope job." },
  { line: "We ride for the merchant caravan instead." },
  { line: "Sign us up for the merchant run instead, Tobias." },
  { line: "Count me out." },
  { line: "I'm not in. Find another party for Wendhope." },
  { line: "We don't take jobs that smell like that one." },
  { line: "Belle, you'd take that job? You're mad." },
  { line: "Agreed, the pay is strange. We still need to think." },
  { line: "Tobias, I'd sooner eat my boots than take the Wendhope posting." },
  { line: "We'll ride out once the rain stops, then decide." },
  { line: "Count us in for drinks, Belle, not for Wendhope." },
  { line: "Belle, you wanted Wendhope. I'm not taking it." },
  { line: "Talk me through the Wendhope posting again. Who signed for it last time?" },
  { line: "Come on, Ash Lanterns, we'll go to the bar first.", party: "Ash Lanterns" },
  { line: "I wait.", npc: "Ellie writes the Ash Lanterns into the ledger for Wendhope, and the party signs beneath the posting." },
  { line: "I shrug and look around the hall.", npc: "You agree to Tobias's terms and take the Wendhope posting." },
  { line: "Tell the Sheridans to hire soldiers." },
  { line: "No. We won't be a forlorn hope for the Sheridans." },
];

const commits = (story: CommitStory, entry: Case): boolean => {
  const deltas: ParsedDelta[] = [{ delta: { q: "path", v: "wendhope" as PrimitiveValue, source: "extractor" }, evidence: entry.line }];
  if (entry.party) deltas.push({ delta: { q: "party_name", v: entry.party, source: "extractor" }, evidence: entry.line });
  const window = [OFFER, ...(entry.npc ? [narrator(entry.npc)] : []), player(entry.line)];
  return applyCommitEvidence(story, deltas, () => window).accepted.some((delta) => delta.delta.q === "path");
};

const measure = (pattern: string) => {
  const story = storyWith(pattern);
  const missed = ACCEPT.filter((entry) => !commits(story, entry)).map((entry) => entry.line);
  const leaked = REFUSE.filter((entry) => commits(story, entry)).map((entry) => entry.line);
  const truePositive = ACCEPT.length - missed.length;
  return { recall: truePositive / ACCEPT.length, precision: truePositive / Math.max(1, truePositive + leaked.length), missed, leaked };
};

describe("T1-2: commitment recall over natural acceptances, precision over refusals (v2.6 plan 14)", () => {
  it("the labelled set holds at least 30 acceptances and 30 refusals or unrelated lines", () => {
    expect(ACCEPT.length).toBeGreaterThanOrEqual(30);
    expect(REFUSE.length).toBeGreaterThanOrEqual(30);
  });

  it("reports both patterns through the guard", () => {
    const rows = [["T0 pattern", measure(COMMIT_T0)], ["T1 pattern", measure(COMMIT_T1)]] as const;
    const lines = rows.map(([name, result]) => `${name}: recall ${result.recall.toFixed(3)} (${ACCEPT.length - result.missed.length}/${ACCEPT.length}), precision ${result.precision.toFixed(3)}, refusals committed ${result.leaked.length}/${REFUSE.length}; missed ${JSON.stringify(result.missed)}`);
    process.stdout.write(`${lines.join("\n")}\n`);
    expect(rows).toHaveLength(2);
  });

  it("commits no refusal, unrelated line or NPC claim", () => {
    expect(measure(COMMIT_T1).leaked).toEqual([]);
  });

  it("commits at least 90% of the natural acceptances", () => {
    const { missed } = measure(COMMIT_T1);
    expect(missed.length).toBeLessThanOrEqual(Math.floor(ACCEPT.length * 0.1));
  });

  it("commits the two T1-2 acceptances that were held three times", () => {
    const story = storyWith(COMMIT_T1);
    expect(commits(story, ACCEPT[0])).toBe(true);
    expect(commits(story, ACCEPT[1])).toBe(true);
  });
});
