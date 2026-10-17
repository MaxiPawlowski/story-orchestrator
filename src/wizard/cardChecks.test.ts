import type { StoryV2 } from "@engine/index";
import { emptyTutorialCard, reviewTutorialCard, type TutorialCard } from "@copilot/characterTutorial";
import { cardFindings, cardWarnings, inOpeningCast, listedTraits, reviewCard, showsBehaviour, type CardCheckInput } from "./cardChecks";
import { emptyEnvironment, validateProvisioningOp } from "./provisioning";
import type { ProvisioningOp } from "./types";

type CardOp = Extract<ProvisioningOp, { kind: "createCharacterCard" }>;

const ENV = { characterNames: ["Mara Venn"] };

const DESCRIPTION = "Brannoc runs the harbour office. He speaks slowly and never answers a question the first time it is asked. When pressed he taps his whistle. "
  + "He wants to retire with his debts paid.";

const tutorial = (patch: Partial<TutorialCard> = {}): TutorialCard => ({
  ...emptyTutorialCard(),
  name: "Brannoc Hale", role: "harbour master", concept: "a tired official who sells silence", appearance: "Broad, grey-bearded.",
  description: DESCRIPTION, personality: "patient, evasive, quietly greedy", ...patch,
});

const draftFor = (name: string, opening: boolean): StoryV2 => ({
  format: 2, title: "Harbour", description: "A port.", qualities: [], transitions: [], roster: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Arrive.", type: "anchor", start: true, effects: { cast_changes: opening ? { enable: [name] } : { disable: [name] } } }],
});

const opOf = (card: TutorialCard): CardOp => ({
  kind: "createCharacterCard", name: card.name, description: card.description,
  ...(card.personality ? { personality: card.personality } : {}), ...(card.first_mes ? { first_mes: card.first_mes } : {}), ...(card.mes_example ? { mes_example: card.mes_example } : {}),
});

const shape = (findings: Array<{ id: string; severity: string }>) => findings.map((finding) => `${finding.id}:${finding.severity}`).sort();

const TUTORIAL_FIXTURES: Record<string, Partial<TutorialCard>> = {
  clean: {},
  "no name": { name: "" },
  "taken name": { name: "mara venn" },
  "empty description": { description: " " },
  "sanitized name": { name: "Dr. Who?" },
  "mention trap": { name: "So Fine" },
  "not ascii": { name: "Lán Fāng" },
  "speaks for player": { opening: true, first_mes: "{{user}} walks in. Brannoc looks up from the ledger and sighs." },
  "greeting outside opening": { opening: false, first_mes: "Brannoc looks up from the ledger." },
  "greeting missing": { opening: true, first_mes: "" },
  "examples without char": { mes_example: "<START>\nHe sighs." },
  budget: { description: `${DESCRIPTION} ${"x. ".repeat(4000)}` },
  adjectives: { description: "Tall, grim, loyal, brave, quiet, kind." },
  thin: { description: "A harbour master." },
  "trait without behaviour": { description: "Brannoc runs the harbour office. He has worked there for thirty years and knows every captain by name. He keeps a ledger of debts." },
  "opening with greeting": { opening: true, first_mes: "Brannoc looks up from the ledger. \"Papers,\" he says." },
};

describe("v2.8 09 harvest A1: shared card checks equal the tutorial's", () => {
  it.each(Object.entries(TUTORIAL_FIXTURES))("%s: identical ids and severities", (_label, patch) => {
    const card = tutorial(patch);
    expect(shape(cardFindings(opOf(card), draftFor(card.name, card.opening), ENV))).toEqual(shape(reviewTutorialCard(card, ENV)));
  });

  it("the tutorial review is the shared review (one source)", () => {
    const card = tutorial({ opening: true, first_mes: "You feel the cold." });
    const input: CardCheckInput = { name: card.name, description: card.description, personality: card.personality, first_mes: card.first_mes, mes_example: card.mes_example, opening: true };
    expect(reviewTutorialCard(card, ENV)).toEqual(reviewCard(input, ENV, "dropped"));
  });
});

const CLEAN_CARDS: CardOp[] = [
  { kind: "createCharacterCard", name: "Brannoc Hale", description: DESCRIPTION, personality: "patient, evasive, quietly greedy" },
  { kind: "createCharacterCard", name: "Ilsa Crane", description: "Ilsa buys anything that fell off a ship. When a seller haggles, she lowers her offer by a coin each time. She keeps her shop dark so nobody sees her hands shake.", personality: "shrewd, nervous" },
  { kind: "createCharacterCard", name: "Teodor Quill", description: "Teodor copies letters for people who cannot write. If a letter is cruel, he softens one word and never admits it. He hums old sea songs while the ink dries on the page.", mes_example: "<START>\n{{char}}: Another letter? Sit, sit." },
  { kind: "createCharacterCard", name: "Rhosyn Dale", description: "Rhosyn captains the night ferry. When fog comes in, she cuts the lantern and steers by the bells alone. She owes the harbour master a debt she will not name to anyone." },
  { kind: "createCharacterCard", name: "Corvin Ashby", description: "Corvin is the harbour's only physician. Whenever he is thanked, he changes the subject to the weather. He drinks before noon and works best after it, which everyone pretends not to notice." },
  { kind: "createCharacterCard", name: "Wenna Tregear", description: "Wenna runs the tide office and knows every boat by its creak. When a stranger asks about the tides, she answers with a question of her own and watches their face.", personality: "curious, guarded" },
];

const PLANTED: Array<{ label: string; op: CardOp; draft?: StoryV2; env?: { characterNames: string[] }; id: string; severity: "blocks" | "warns" }> = [
  { label: "no name", op: { ...CLEAN_CARDS[1], name: " " }, id: "name-missing", severity: "blocks" },
  { label: "taken name", op: { ...CLEAN_CARDS[1], name: "Mara Venn" }, id: "name-taken", severity: "blocks" },
  { label: "empty description", op: { ...CLEAN_CARDS[1], description: "" }, id: "description-empty", severity: "blocks" },
  { label: "sanitized name", op: { ...CLEAN_CARDS[1], name: "Ilsa: Crane" }, id: "name-sanitized", severity: "warns" },
  { label: "mention trap", op: { ...CLEAN_CARDS[1], name: "The Fence" }, id: "name-mention-trap", severity: "warns" },
  { label: "accented name", op: { ...CLEAN_CARDS[1], name: "Ilsé Crane" }, id: "name-not-ascii", severity: "warns" },
  { label: "thin description", op: { ...CLEAN_CARDS[1], description: "Buys stolen goods." }, id: "description-thin", severity: "warns" },
  { label: "adjective list", op: { ...CLEAN_CARDS[1], description: "Shrewd, nervous, greedy, clever, pale, thin, quick and quiet, a fence of the old harbour market district." }, id: "voice-adjectives", severity: "warns" },
  { label: "trait without behaviour", op: { ...CLEAN_CARDS[1], description: "Ilsa buys anything that fell off a ship. Her shop is dark and smells of tar. She has run it for twenty years and her mother ran it before her." }, id: "trait-no-behaviour", severity: "warns" },
  { label: "greeting speaks for the player", op: { ...CLEAN_CARDS[1], first_mes: "You walk into the dark shop and Ilsa looks up." }, draft: draftFor("Ilsa Crane", true), id: "greeting-speaks-for-player", severity: "warns" },
  { label: "greeting outside the opening", op: { ...CLEAN_CARDS[1], first_mes: "Ilsa looks up from the counter." }, draft: draftFor("Ilsa Crane", false), id: "greeting-not-opening", severity: "warns" },
  { label: "examples without {{char}}:", op: { ...CLEAN_CARDS[1], mes_example: "<START>\nShe counts the coins twice." }, id: "examples-no-char-line", severity: "warns" },
];

const NEUTRAL: StoryV2 = { format: 2, title: "Harbour", description: "", qualities: [], transitions: [], roster: [], checkpoints: [{ id: "start", name: "Start", objective: "Arrive.", type: "anchor", start: true }] };

describe("v2.8 09 harvest A2: planted card mistakes", () => {
  it.each(PLANTED)("$label is flagged as $id ($severity)", ({ op, draft, env, id, severity }) => {
    const found = cardFindings(op, draft ?? NEUTRAL, env ?? ENV).find((finding) => finding.id === id);
    expect(found?.severity).toBe(severity);
  });

  it("12 planted, 6 clean cards with no finding", () => {
    expect(PLANTED).toHaveLength(12);
    expect(new Set(PLANTED.map((entry) => entry.id)).size).toBe(12);
    expect(CLEAN_CARDS.map((op) => cardFindings(op, NEUTRAL, ENV))).toEqual(CLEAN_CARDS.map(() => []));
  });

  it("no warn finding refuses an op", () => {
    const warnOnly = PLANTED.filter((entry) => entry.severity === "warns");
    expect(warnOnly.map(({ op }) => validateProvisioningOp(op, { ...emptyEnvironment(), characterNames: ENV.characterNames }).ok)).toEqual(warnOnly.map(() => true));
    expect(warnOnly.every(({ op, draft, env }) => cardWarnings(cardFindings(op, draft ?? NEUTRAL, env ?? ENV)).length > 0)).toBe(true);
  });
});

describe("v2.8 09 harvest: opening cast and behaviour rules", () => {
  it("reads the opening cast from the start checkpoint's cast changes, unknown otherwise", () => {
    expect(inOpeningCast(draftFor("Ilsa Crane", true), "ilsa crane")).toBe(true);
    expect(inOpeningCast(draftFor("Ilsa Crane", false), "Ilsa Crane")).toBe(false);
    expect(inOpeningCast(NEUTRAL, "Ilsa Crane")).toBeNull();
    expect(cardFindings({ ...CLEAN_CARDS[1], first_mes: "" }, NEUTRAL, ENV)).toEqual([]);
  });

  it("a trait list needs one sentence in the trigger form", () => {
    expect(listedTraits("patient, evasive, quietly greedy")).toEqual(["patient", "evasive", "quietly greedy"]);
    expect(listedTraits("A tired official who sells silence")).toEqual([]);
    expect(showsBehaviour("When pressed he taps his whistle.")).toBe(true);
    expect(showsBehaviour("He keeps a ledger of debts.")).toBe(false);
  });
});
