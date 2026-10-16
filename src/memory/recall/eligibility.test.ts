import { candidate, ctxFor, message, read, secret, secretsOf, spanIn, witnessOf } from "../../../test/support/recallKit";
import { keptFrom } from "../heldSecrets";
import { isProvenanceRefusal, recallVerdict, type RecallTelling } from "./eligibility";
import type { RecallMessage } from "./live";

const CHAT: RecallMessage[] = [
  message(0, "Corvin", 'Corvin nods. "The ferry leaves at the second bell."'),
  message(1, "Tamsin", 'Tamsin leans close to Corvin and murmurs, "The strongbox code is NX-QK7Z2M."'),
  message(2, "Hollis", 'Hollis calls out, "Supper at dusk." Then, quietly to Corvin: "Bring the knife tonight."'),
  message(3, "Hollis", 'Hollis mutters into the fog. "Something moved by the reeds."'),
  message(4, "Corvin", 'Corvin turns to Hollis. "Tamsin told me the strongbox code is NX-QK7Z2M."'),
  message(5, "Tamsin", 'Tamsin leans close to Corvin and murmurs, "It was me at the well."'),
  message(6, "Corvin", 'Corvin leans close to Tamsin and murmurs, "Those papers carry a seal I pressed myself."'),
  message(7, "Hollis", 'Hollis laughs. "We split the reward three ways."', { swipeId: 0 }),
  message(8, "Corvin", 'Corvin says to everyone, "I sold the family map to the toll keeper for passage money."'),
  message(9, "Tamsin", 'Tamsin shrugs. "No idea where it went."'),
  message(10, "Corvin", 'Corvin waves. "Later, then."'),
];

const READS = [
  read("r1", 0, 8, [
    "WITNESS m=0 heard=all-present", "WITNESS m=1 heard=Tamsin,corvin", "WITNESS m=2 mixed",
    'SPAN m=2 from="Hollis calls out, "Supper" heard=all-present', 'SPAN m=2 from="Then, quietly to Corvin:" heard=hollis,corvin',
    "WITNESS m=3 heard=unknown", "WITNESS m=5 heard=tamsin,corvin", "WITNESS m=6 heard=corvin,tamsin", "WITNESS m=7 heard=all-present", "WITNESS m=8 heard=all-present",
  ]),
  read("r2", 9, 9, [], "outage"),
];

const WITNESS = witnessOf(READS, CHAT);
const SECRETS = secretsOf([
  secret("s1", "Tamsin", "hiding", "Tamsin poisoned Hollis", "Hollis"),
  secret("s2", "Hollis", "unaware", "Hollis is unaware that Corvin forged the reeve seal on the travel writ"),
  secret("s3", "Corvin", "hiding", "Corvin is hiding that he sold the family map to the toll keeper", "Hollis"),
]);
const TELLINGS: RecallTelling[] = [{
  receiver: "hollis",
  telling: spanIn(CHAT, 4, "Tamsin told me the strongbox code is NX-QK7Z2M."),
  origin: spanIn(CHAT, 1, "The strongbox code is NX-QK7Z2M."),
}];

const verdict = (member: string, messageId: number, quote: string, chat: RecallMessage[] = CHAT, text?: string) =>
  recallVerdict(candidate(CHAT, messageId, quote, text), ctxFor(member, chat, WITNESS, { tellings: TELLINGS, secrets: SECRETS }));

describe("plan 43: recall eligibility is provenance first (v2.8 42 §0), keptFrom second", () => {
  it("admits a witnessed span", () => {
    expect(verdict("corvin", 0, "The ferry leaves at the second bell.")).toEqual({ ok: true, basis: "witnessed" });
  });

  it("refuses a planted unwitnessed aside", () => {
    expect(recallVerdict(candidate(CHAT, 1, "The strongbox code is NX-QK7Z2M."), ctxFor("hollis", CHAT, WITNESS, { secrets: SECRETS }))).toMatchObject({ ok: false, reason: "not witnessed" });
    expect(verdict("hollis", 6, "Those papers carry a seal I pressed myself.")).toMatchObject({ ok: false, reason: "not witnessed" });
  });

  it("mixed message: only a span wholly inside a positively-heard part passes", () => {
    expect(verdict("corvin", 2, "Bring the knife tonight.")).toEqual({ ok: true, basis: "witnessed" });
    expect(verdict("tamsin", 2, "Supper at dusk.")).toEqual({ ok: true, basis: "witnessed" });
    expect(verdict("corvin", 2, CHAT[2].text)).toMatchObject({ ok: false, reason: "mixed message" });
    expect(verdict("tamsin", 2, "Bring the knife tonight.")).toMatchObject({ ok: false, reason: "mixed message" });
  });

  it("drops every non-classified state: unknown, outage, pending", () => {
    expect(verdict("corvin", 3, "Something moved by the reeds.")).toMatchObject({ ok: false, reason: "witness unknown", state: "unknown" });
    expect(verdict("corvin", 9, "No idea where it went.")).toMatchObject({ ok: false, reason: "witness unknown", state: "outage" });
    expect(verdict("corvin", 10, "Later, then.")).toMatchObject({ ok: false, reason: "witness unknown", state: "pending" });
  });

  it("told: the receiver gets the telling span, never the origin; nobody else gets either", () => {
    expect(verdict("hollis", 4, "Tamsin told me the strongbox code is NX-QK7Z2M.")).toEqual({ ok: true, basis: "told" });
    expect(verdict("hollis", 1, "The strongbox code is NX-QK7Z2M.")).toMatchObject({ ok: false, reason: "origin of a telling" });
    expect(verdict("tamsin", 4, "Tamsin told me the strongbox code is NX-QK7Z2M.")).toMatchObject({ ok: false, reason: "witness unknown" });
  });

  it("a short secret never becomes a HeldSecret, so provenance does the refusing", () => {
    expect(keptFrom("It was me at the well.", SECRETS, ["hollis"])).toBe(false);
    const refused = verdict("hollis", 5, "It was me at the well.");
    expect(refused).toMatchObject({ ok: false, reason: "not witnessed" });
    expect(isProvenanceRefusal(refused)).toBe(true);
  });

  it("a paraphrased secret slips past keptFrom; provenance refuses it", () => {
    expect(keptFrom("Those papers carry a seal I pressed myself.", SECRETS, ["hollis"])).toBe(false);
    expect(verdict("hollis", 6, "Those papers carry a seal I pressed myself.")).toMatchObject({ ok: false, reason: "not witnessed" });
  });

  it("keptFrom stays as the backstop when the witness record is wrong, counted as a keptFrom-only refusal", () => {
    const refused = verdict("hollis", 8, "I sold the family map to the toll keeper for passage money.");
    expect(refused).toEqual({ ok: false, reason: "held secret" });
    expect(isProvenanceRefusal(refused)).toBe(false);
    expect(verdict("tamsin", 8, "I sold the family map to the toll keeper for passage money.")).toMatchObject({ ok: false, reason: "held secret" });
  });

  it("a removed, edited, swiped or hidden message never returns", () => {
    const quote = "We split the reward three ways.";
    expect(verdict("corvin", 7, quote)).toEqual({ ok: true, basis: "witnessed" });
    expect(verdict("corvin", 7, quote, CHAT.filter((entry) => entry.messageId !== 7))).toEqual({ ok: false, reason: "message removed" });
    expect(verdict("corvin", 7, quote, CHAT.map((entry) => (entry.messageId === 7 ? { ...entry, text: entry.text.replace("three", "four") } : entry)), CHAT[7].text))
      .toEqual({ ok: false, reason: "message changed" });
    expect(verdict("corvin", 7, quote, CHAT.map((entry) => (entry.messageId === 7 ? { ...entry, swipeId: 1 } : entry)))).toEqual({ ok: false, reason: "message changed" });
    expect(verdict("corvin", 7, quote, CHAT.map((entry) => (entry.messageId === 7 ? { ...entry, hidden: true } : entry)))).toEqual({ ok: false, reason: "message hidden" });
  });

  it("the live check runs before provenance: a removed unwitnessed span reports removal", () => {
    expect(verdict("hollis", 1, "The strongbox code is NX-QK7Z2M.", CHAT.filter((entry) => entry.messageId !== 1))).toEqual({ ok: false, reason: "message removed" });
  });
});
