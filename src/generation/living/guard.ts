import type { DirectorDraft } from "./types";

const PLAYER_ACTS = [
  "accept", "accepts", "accepted", "agree", "agrees", "agreed", "decide", "decides", "decided", "choose", "chooses", "chose", "refuse", "refuses", "refused",
  "say", "says", "said", "tell", "tells", "told", "go", "goes", "went", "walk", "walks", "walked", "take", "takes", "took", "feel", "feels", "felt",
  "realize", "realizes", "realise", "realises", "join", "joins", "joined", "promise", "promises", "promised", "attack", "attacks", "attacked",
  "kill", "kills", "killed", "kiss", "kisses", "kissed", "betray", "betrays", "betrayed", "sign", "signs", "signed", "follow", "follows", "followed",
  "leave", "leaves", "left", "answer", "answers", "answered", "reveal", "reveals", "revealed", "confess", "confesses", "confessed",
  "keep", "keeps", "kept", "break", "breaks", "broke", "broken", "fulfil", "fulfill", "fulfills", "fulfilled", "release", "releases", "released",
  "surrender", "surrenders", "surrendered", "give", "gives", "gave", "obey", "obeys", "obeyed", "submit", "submits", "submitted", "trust", "trusts", "trusted",
  "yield", "yields", "yielded", "swear", "swears", "swore", "conclude", "concludes", "concluded", "believe", "believes", "believed",
  "understand", "understands", "understood",
];

const ACTS = PLAYER_ACTS.join("|");

const subjects = (names: readonly string[]): string[] => [
  "\\{\\{user\\}\\}", "the player", "the player character", "you",
  ...names.map((name) => name.trim()).filter((name) => name.length > 1).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
];

export const narratesPlayer = (text: string, playerNames: readonly string[] = []): boolean => {
  const lead = "(?:^|[.;:!?,]\\s*|\\b(?:and|then|so|until|when|after)\\s+)";
  const adverbs = "(?:[a-z]+ly,?\\s+(?:and\\s+)?){0,3}";
  const modal = `${adverbs}(?:must\\s+|will\\s+|has\\s+|have\\s+|is\\s+going\\s+to\\s+|can(?:'|’)?t\\s+help\\s+but\\s+|cannot\\s+help\\s+but\\s+)?${adverbs}`;
  const pattern = new RegExp(`${lead}(?:${subjects(playerNames).join("|")})\\s+${modal}(?:${ACTS})\\b`, "i");
  return pattern.test(text.trim());
};

export interface DraftGuardDeps {
  playerNames: readonly string[];
  restatesSecret: (text: string) => boolean;
}

export function guardDraft(draft: DirectorDraft, deps: DraftGuardDeps): string[] {
  const issues: string[] = [];
  const fields: Array<[string, string]> = [
    ["name", draft.anchor.name],
    ["objective", draft.anchor.objective],
    ...(draft.opensWhen.kind === "new" ? [["opens_when rubric", draft.opensWhen.rubric] as [string, string]] : []),
    ...draft.newQualities.map((quality) => [`rubric of ${quality.key}`, quality.rubric] as [string, string]),
    ...(draft.chapterTitle ? [["chapter title", draft.chapterTitle] as [string, string]] : []),
  ];
  fields.forEach(([label, value]) => {
    if (deps.restatesSecret(value)) issues.push(`the ${label} restates something a character keeps private`);
  });
  if (narratesPlayer(draft.anchor.objective, deps.playerNames)) issues.push("the objective narrates the player's own act");
  if (narratesPlayer(draft.anchor.name, deps.playerNames)) issues.push("the name narrates the player's own act");
  return issues;
}
