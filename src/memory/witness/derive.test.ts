import { revisionOf } from "./contract";
import { deriveFromRead, deriveWitnessAudit, deriveWitnessClaims, hasAsideCue, nameIndex, sentenceSpans, type DeriveInput, type DeriveMember, type DeriveMessage } from "./derive";
import { acceptWitnessRead, witnessLookup } from "./record";
import { createWitness, rollbackWitness } from "./state";

const cast: DeriveMember[] = [
  { id: "dm", names: ["Narrator"], omniscient: true },
  { id: "mara", names: ["Mara", "The Smith"], omniscient: false },
  { id: "ben", names: ["Ben"], omniscient: false },
  { id: "ula", names: ["Ula"], omniscient: false },
  { id: "ivo", names: ["Ivo"], omniscient: false },
];

const msg = (messageId: number, speaker: string | null, text: string, extra: Partial<DeriveMessage> = {}): DeriveMessage => ({ messageId, speaker, text, ...extra });

const input = (messages: DeriveMessage[], extra: Partial<DeriveInput> = {}): DeriveInput => ({
  from: messages[0].messageId, to: messages.at(-1)?.messageId ?? 0, messages, members: cast, enabled: ["dm", "mara", "ben", "ula", "ivo"], ...extra,
});

const heardOf = (claims: ReturnType<typeof deriveWitnessClaims>, messageId: number) => claims.find((claim) => claim.messageId === messageId)?.heard;

describe("v3.0 12 witness derivation: speaker, narrator, group and stage rules", () => {
  it("the speaker always hears their own message; the player is never a member", () => {
    const claims = deriveWitnessClaims(input([msg(1, "ben", "I wait by the door."), msg(2, null, "I nod.")]));
    expect(heardOf(claims, 1)).toEqual({ kind: "members", members: ["ben"] });
    expect(heardOf(claims, 2)).toEqual({ kind: "members", members: ["ben"] });
  });

  it("an omniscient member hears only as the speaker by default, and every message under omniscient always", () => {
    const messages = [msg(1, "dm", "Rain falls on the square."), msg(2, "mara", "Mara looks up.")];
    expect(heardOf(deriveWitnessClaims(input(messages)), 2)).toEqual({ kind: "members", members: ["mara"] });
    expect(heardOf(deriveWitnessClaims(input(messages)), 1)).toEqual({ kind: "members", members: ["dm", "mara"] });
    expect(heardOf(deriveWitnessClaims(input(messages), { stage: "appeared", omniscient: "always", mention: true, lookahead: true, asides: true }), 2))
      .toEqual({ kind: "members", members: ["dm", "mara"] });
  });

  it("a member disabled in the group never hears, even when named; one never seen on stage does not either", () => {
    const claims = deriveWitnessClaims(input([msg(1, "mara", "Mara calls for Ben and Ula."), msg(2, "mara", "No answer.")], { enabled: ["dm", "mara", "ben", "ivo"] }));
    expect(heardOf(claims, 2)).toEqual({ kind: "members", members: ["mara", "ben"] });
  });

  it("looks ahead to the end of the window, never past it", () => {
    const messages = [msg(1, "mara", "Mara sharpens a blade."), msg(2, "ben", "Ben walks in."), msg(3, "ivo", "Ivo follows.")];
    const claims = deriveWitnessClaims(input(messages, { from: 1, to: 2 }));
    expect(claims.map((claim) => claim.messageId)).toEqual([1, 2]);
    expect(heardOf(claims, 1)).toEqual({ kind: "members", members: ["mara", "ben"] });
    expect(heardOf(deriveWitnessClaims(input(messages, { from: 1, to: 2 }), { stage: "appeared", omniscient: "speaker-only", mention: true, lookahead: false, asides: true }), 1))
      .toEqual({ kind: "members", members: ["mara"] });
  });

  it("context rows before the window put a member on stage; claims cover the window only", () => {
    const claims = deriveWitnessClaims(input([msg(0, "ula", "Ula hums."), msg(5, "mara", "Mara laughs.")], { from: 5, to: 5 }));
    expect(claims.map((claim) => claim.messageId)).toEqual([5]);
    expect(heardOf(claims, 5)).toEqual({ kind: "members", members: ["mara", "ula"] });
  });

  it("a presence source for a message wins over appearance, still bounded by the enabled listeners", () => {
    const claims = deriveWitnessClaims(input([msg(1, "mara", "Mara and Ben talk.", { present: ["ula", "ben", "ghost", "dm"] })], { enabled: ["dm", "mara", "ula"] }));
    expect(heardOf(claims, 1)).toEqual({ kind: "members", members: ["mara", "ula"] });
  });
});

describe("v3.0 12 witness derivation: asides fail closed", () => {
  const stage = [msg(1, "mara", "Mara, Ben, Ula and Ivo gather at the forge.")];

  it("a cue in the first sentence makes the whole message an aside to the speaker and the named addressee", () => {
    const claims = deriveWitnessClaims(input([...stage, msg(2, "ben", "Ben whispers to Ula: the key is under the anvil.")]));
    expect(heardOf(claims, 2)).toEqual({ kind: "members", members: ["ben", "ula"] });
  });

  it("an aside with no resolvable addressee reaches the speaker only; a player aside reaches nobody", () => {
    const claims = deriveWitnessClaims(input([...stage, msg(2, "ben", "Ben mutters under his breath."), msg(3, null, "I whisper to the wind.")]));
    expect(heardOf(claims, 2)).toEqual({ kind: "members", members: ["ben"] });
    expect(heardOf(claims, 3)).toEqual({ kind: "members", members: [] });
  });

  it("a cue later in the message makes it mixed: spans cover the whole text, the cued one reaches only its addressee", () => {
    const text = "Ben sets down the hammer. Then he leans to Ivo's ear and murmurs a name. The others keep working.";
    const claims = deriveWitnessClaims(input([...stage, msg(2, "ben", text)]));
    const claim = claims.find((entry) => entry.messageId === 2);
    expect(claim?.mixed).toBe(true);
    expect(claim?.spans.map((span) => span.heard)).toEqual([
      { kind: "members", members: ["mara", "ben", "ula", "ivo"] },
      { kind: "members", members: ["ben", "ivo"] },
      { kind: "members", members: ["mara", "ben", "ula", "ivo"] },
    ]);
    expect(claim?.spans[0].span[0]).toBe(0);
    expect(claim?.spans.at(-1)?.span[1]).toBe(text.length);
    const state = acceptWitnessRead(createWitness(), "d1", deriveWitnessAudit(input([...stage, msg(2, "ben", text)])));
    const cued = claim?.spans[1].span as [number, number];
    expect(witnessLookup(state, "mara", 2, cued)).toMatchObject({ state: "classified", heard: "no", mixed: true });
    expect(witnessLookup(state, "ivo", 2, cued)).toMatchObject({ heard: "yes", insideHeardSpan: true });
    expect(witnessLookup(state, "mara", 2)).toMatchObject({ heard: "unknown", mixed: true });
    expect(witnessLookup(state, "mara", 2, [0, text.length])).toMatchObject({ heard: "unknown" });
  });

  it("a cued sentence whose audience equals the stage stays one whole-message claim", () => {
    const claims = deriveWitnessClaims(input([msg(1, "mara", "Mara waits."), msg(2, "ben", "Ben nods. He whispers to Mara.")], { enabled: ["mara", "ben"] }));
    expect(claims[1]).toMatchObject({ mixed: false, heard: { kind: "members", members: ["mara", "ben"] }, spans: [] });
  });

  it("asides off keeps a cued message on the stage set", () => {
    const claims = deriveWitnessClaims(input([...stage, msg(2, "ben", "Ben whispers to Ula.")]), { stage: "appeared", omniscient: "speaker-only", mention: true, lookahead: true, asides: false });
    expect(heardOf(claims, 2)).toEqual({ kind: "members", members: ["mara", "ben", "ula", "ivo"] });
  });

  it("recognises the cue families and splits sentences on terminal punctuation and newlines", () => {
    expect(["She whispers.", "a murmured reply", "under his breath", "her voice low", "too low for anyone", "so only Ben can hear", "takes Ula aside", "to Arin alone"].every(hasAsideCue)).toBe(true);
    expect(["She shouts.", "He speaks to the room.", "A low wall"].some(hasAsideCue)).toBe(false);
    expect(sentenceSpans("One. Two!\nThree")).toEqual([[0, 5], [5, 10], [10, 15]]);
  });
});

describe("v3.0 12 witness derivation: names, read shape and rollback", () => {
  it("drops a name token two members share", () => {
    const index = nameIndex([{ id: "a", names: ["Envoy Sera Ash"], omniscient: false }, { id: "b", names: ["Envoy Halden Corvane"], omniscient: false }]);
    expect(index.has("Envoy")).toBe(false);
    expect(index.get("Sera")).toBe("a");
    expect(index.get("Envoy Halden Corvane")).toBe("b");
    expect(index.get("Corvane")).toBe("b");
  });

  it("deriveFromRead resolves speakers by name or alias, reads the narrator's view and uses only context before the window", () => {
    const roster = [{ id: "dm", name: "DM Narrator", view: "omniscient" }, { id: "arin", name: "Arin", aliases: ["The Ranger"] }, { id: "kel", name: "Kel" }];
    const window = { from: 3, to: 4, messages: [
      { messageId: 3, speaker: "DM Narrator", text: "The bell rings over the square.", isUser: false },
      { messageId: 4, speaker: "the ranger", text: "I nod.", isUser: false, swipeId: 2 },
    ] };
    const context = [{ messageId: 1, speaker: "Kel", text: "Kel waits.", isUser: false }, { messageId: 3, speaker: "Kel", text: "ignored", isUser: false }];
    const audit = deriveFromRead(roster, ["dm", "arin", "kel"], window, context);
    expect(audit.status).toBe("accepted");
    expect(audit.inputRange).toEqual({ from: 3, to: 4, revisions: window.messages.map((message) => ({ messageId: message.messageId, revision: revisionOf(message) })) });
    expect(audit.claims.map((claim) => claim.heard)).toEqual([{ kind: "members", members: ["dm", "arin", "kel"] }, { kind: "members", members: ["arin", "kel"] }]);
  });

  it("rollback drops the derived read reaching the message and keeps the earlier one, as a replay of the kept read would", () => {
    const first = input([msg(1, "mara", "Mara sings."), msg(2, "ben", "Ben listens.")]);
    const second = input([msg(1, "mara", "Mara sings."), msg(2, "ben", "Ben listens."), msg(3, "ula", "Ula whispers to Ben.")], { from: 2, to: 3 });
    const both = acceptWitnessRead(acceptWitnessRead(createWitness(), "d1", deriveWitnessAudit(first)), "d2", deriveWitnessAudit(second));
    const rolled = rollbackWitness(both, 3);
    const replay = acceptWitnessRead(createWitness(), "d1", deriveWitnessAudit(first));
    for (const member of ["mara", "ben", "ula"]) for (const id of [1, 2]) expect(witnessLookup(rolled, member, id)).toEqual(witnessLookup(replay, member, id));
    expect(witnessLookup(rolled, "ben", 3).state).not.toBe("classified");
  });
});
