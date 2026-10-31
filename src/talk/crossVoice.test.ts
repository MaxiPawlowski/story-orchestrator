import { crossVoiceHits, partyNames, trimCrossVoice, type VoiceParty } from "./crossVoice";

const others: VoiceParty[] = [
  { id: "bram", names: partyNames("Bram Holt", ["the Smith"]) },
  { id: "max", names: partyNames("Max"), player: true },
];

const BODY = "*Mara checks the rope twice and ties it off at the post, then looks back at the dark water.* \"We leave at dawn.\"";

describe("cross-voice detector", () => {
  it("finds a header line for another member in its common shapes", () => {
    for (const header of ["Bram:", "**Bram:**", "**Bram Holt**:", "> Bram:", "the Smith:"]) {
      const hits = crossVoiceHits(`${BODY}\n${header} "Agreed."`, ["Mara"], others);
      expect(hits.map((hit) => [hit.kind, hit.party])).toEqual([["header", "bram"]]);
    }
  });

  it("finds prose attribution for another member or the player, never for the speaker", () => {
    expect(crossVoiceHits(`${BODY} "Fine," Bram said.`, ["Mara"], others).map((hit) => hit.kind)).toEqual(["said"]);
    expect(crossVoiceHits(`${BODY} Max asks, "Why?"`, ["Mara"], others)).toEqual([expect.objectContaining({ kind: "said", party: "max", player: true })]);
    expect(crossVoiceHits(`"Fine," Mara said.\nMara: "Go."`, ["Mara"], others)).toEqual([]);
  });

  it("ignores a name mid-line, a lowercase word and the speaker's own header", () => {
    expect(crossVoiceHits(`${BODY} She glances at Bram: nothing.`, ["Mara"], others)).toEqual([]);
    expect(crossVoiceHits(`${BODY}\nmax: a word`, ["Mara"], others)).toEqual([]);
    expect(crossVoiceHits(`Mara: ${BODY}`, ["Mara"], others)).toEqual([]);
  });

  it("does not let a shared given name count as another member when it is also the speaker's", () => {
    expect(crossVoiceHits(`${BODY}\nBram: "Yes."`, ["Bram Stone"], others)).toEqual([]);
  });
});

describe("cross-voice trim", () => {
  it("cuts from the first foreign header line and keeps the speaker's part", () => {
    const trim = trimCrossVoice(`${BODY}\n\n**Bram:** "Agreed." *He nods.*\nMax: "Then go."`, ["Mara"], others);
    expect(trim?.text).toBe(BODY);
    expect(trim?.hit.party).toBe("bram");
    expect(trim?.removed).toBeGreaterThan(0);
  });

  it("keeps a reply that would be left too short, and one with no header", () => {
    expect(trimCrossVoice("*Nods.*\nBram: \"Agreed, we go now.\"", ["Mara"], others)).toBeNull();
    expect(trimCrossVoice("Bram: the whole reply is his.", ["Mara"], others)).toBeNull();
    expect(trimCrossVoice(`${BODY} "Fine," Bram said.`, ["Mara"], others)).toBeNull();
  });
});
