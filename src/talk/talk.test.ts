import type { RosterMember, TalkControl } from "@engine/index";
import { parseDirectorResponse } from "./parse";
import { renderDirectorPrompt } from "./prompt";
import { buildCandidates, chooseByRules, directorEnabled, directorInstruction, narrowByMention } from "./rules";
import type { TalkCandidate } from "./types";

const roster: RosterMember[] = [
  { id: "guard", name: "Captain Mara" },
  { id: "sage", name: "Elder Finn" },
  { id: "thief" },
];

const allEnabled = roster.map((member) => member.id);

const candidate = (rosterId: string, name: string, weight = 1): TalkCandidate => ({ rosterId, name, weight });

describe("buildCandidates", () => {
  it("uses the whole enabled roster when speakers are absent", () => {
    expect(buildCandidates({}, roster, allEnabled)).toEqual([
      candidate("guard", "Captain Mara"),
      candidate("sage", "Elder Finn"),
      candidate("thief", "thief"),
    ]);
  });

  it("resolves speakers by roster id or name, keeps weights, drops unknown and disabled", () => {
    const control: TalkControl = { speakers: [{ member: "Captain Mara", weight: 3 }, { member: "sage" }, { member: "ghost" }, { member: "thief" }] };
    expect(buildCandidates(control, roster, ["guard", "sage"])).toEqual([
      candidate("guard", "Captain Mara", 3),
      candidate("sage", "Elder Finn"),
    ]);
  });

  it("dedupes repeated speaker refs", () => {
    const control: TalkControl = { speakers: [{ member: "guard" }, { member: "Captain Mara", weight: 5 }] };
    expect(buildCandidates(control, roster, allEnabled)).toEqual([candidate("guard", "Captain Mara")]);
  });

  it("adds a lead the speakers list leaves out, so the rules can still pick it", () => {
    const control: TalkControl = { speakers: [{ member: "guard", weight: 2 }], lead: "Elder Finn" };
    const candidates = buildCandidates(control, roster, allEnabled);
    expect(candidates).toEqual([candidate("guard", "Captain Mara", 2), candidate("sage", "Elder Finn")]);
    expect(chooseByRules(control, candidates, { lastSpeakerRosterId: "guard" })).toEqual(candidate("sage", "Elder Finn"));
  });

  it("alternates an added lead with the others under no_repeat instead of repeating it", () => {
    const control: TalkControl = { speakers: [{ member: "guard" }], lead: "sage" };
    const candidates = buildCandidates(control, roster, allEnabled);
    const picks: string[] = [];
    let last: string | null = null;
    for (let turn = 0; turn < 4; turn += 1) {
      last = chooseByRules(control, candidates, { lastSpeakerRosterId: last })?.rosterId ?? null;
      picks.push(last ?? "none");
    }
    expect(picks).toEqual(["sage", "guard", "sage", "guard"]);
  });

  it("lets a lead that is the only enabled candidate speak every turn, since nobody else may", () => {
    const control: TalkControl = { speakers: [{ member: "guard" }], lead: "sage" };
    const candidates = buildCandidates(control, roster, ["sage"]);
    expect(candidates).toEqual([candidate("sage", "Elder Finn")]);
    expect(chooseByRules(control, candidates, { lastSpeakerRosterId: "sage" })).toEqual(candidate("sage", "Elder Finn"));
  });

  it("keeps a listed lead's weight and never adds a lead that is disabled or not in the roster", () => {
    expect(buildCandidates({ speakers: [{ member: "sage", weight: 4 }], lead: "sage" }, roster, allEnabled)).toEqual([candidate("sage", "Elder Finn", 4)]);
    expect(buildCandidates({ speakers: [{ member: "guard" }], lead: "sage" }, roster, ["guard"])).toEqual([candidate("guard", "Captain Mara")]);
    expect(buildCandidates({ speakers: [{ member: "guard" }], lead: "Adolion Narrator" }, roster, allEnabled)).toEqual([candidate("guard", "Captain Mara")]);
  });
});

describe("narrowByMention", () => {
  const candidates = buildCandidates({}, roster, allEnabled);

  it("matches a candidate by any name word, case-insensitive", () => {
    expect(narrowByMention(candidates, "What do you think, mara?")).toEqual([candidate("guard", "Captain Mara")]);
  });

  it("returns all mentioned candidates", () => {
    expect(narrowByMention(candidates, "Finn and Mara, both of you!")).toHaveLength(2);
  });

  it("returns empty when nobody is mentioned", () => {
    expect(narrowByMention(candidates, "The wind howls outside.")).toEqual([]);
  });
});

describe("chooseByRules", () => {
  const candidates = [candidate("guard", "Captain Mara", 1), candidate("sage", "Elder Finn", 3)];

  it("prefers the lead when eligible", () => {
    expect(chooseByRules({ lead: "Elder Finn" }, candidates, { lastSpeakerRosterId: null })).toEqual(candidate("sage", "Elder Finn", 3));
  });

  it("excludes the previous speaker by default", () => {
    expect(chooseByRules({ lead: "sage" }, candidates, { lastSpeakerRosterId: "sage" })).toEqual(candidate("guard", "Captain Mara"));
  });

  it("allows repeats when no_repeat is false", () => {
    expect(chooseByRules({ lead: "sage", no_repeat: false }, candidates, { lastSpeakerRosterId: "sage" })).toEqual(candidate("sage", "Elder Finn", 3));
  });

  it("falls back to the full pool when no_repeat excludes everyone", () => {
    expect(chooseByRules({}, [candidate("guard", "Captain Mara")], { lastSpeakerRosterId: "guard" })).toEqual(candidate("guard", "Captain Mara"));
  });

  it("respects weights through the injected rng", () => {
    expect(chooseByRules({}, candidates, { lastSpeakerRosterId: null, random: () => 0.1 })).toEqual(candidate("guard", "Captain Mara"));
    expect(chooseByRules({}, candidates, { lastSpeakerRosterId: null, random: () => 0.9 })).toEqual(candidate("sage", "Elder Finn", 3));
  });

  it("returns null with no candidates", () => {
    expect(chooseByRules({}, [], { lastSpeakerRosterId: null })).toBeNull();
  });
});

describe("director flags", () => {
  it("reads boolean and object director config", () => {
    expect(directorEnabled({})).toBe(false);
    expect(directorEnabled({ director: true })).toBe(true);
    expect(directorEnabled({ director: {} })).toBe(true);
    expect(directorInstruction({ director: true })).toBeUndefined();
    expect(directorInstruction({ director: { instruction: "Keep Finn quiet." } })).toBe("Keep Finn quiet.");
  });
});

describe("renderDirectorPrompt", () => {
  it("lists candidates, lead, guidance, silence rule, and transcript", () => {
    const prompt = renderDirectorPrompt({
      storyTitle: "Sun Ruins",
      checkpointName: "The Gate",
      objective: "Open the gate",
      candidates: [candidate("guard", "Captain Mara"), candidate("sage", "Elder Finn")],
      allowSilence: true,
      lead: "Captain Mara",
      instruction: "Finn only answers riddles.",
      window: [{ speaker: "User", text: "Anyone here?" }],
    });
    expect(prompt).toContain("Candidates: Captain Mara, Elder Finn");
    expect(prompt).toContain("Scene lead: Captain Mara");
    expect(prompt).toContain("Author guidance: Finn only answers riddles.");
    expect(prompt).toContain("answer NONE");
    expect(prompt).toContain("User: Anyone here?");
    expect(prompt).toContain("SPEAKER: <Captain Mara | Elder Finn | NONE>");
  });

  it("omits NONE when silence is not allowed", () => {
    const prompt = renderDirectorPrompt({
      storyTitle: "Sun Ruins",
      checkpointName: "The Gate",
      objective: "Open the gate",
      candidates: [candidate("guard", "Captain Mara")],
      allowSilence: false,
      window: [],
    });
    expect(prompt).toContain("SPEAKER: <Captain Mara>");
    expect(prompt).not.toContain("NONE");
  });

  it("offers PLAYER as a hand-back answer only when asked", () => {
    const base = { storyTitle: "Sun Ruins", checkpointName: "The Gate", objective: "Open the gate", candidates: [candidate("guard", "Captain Mara")], allowSilence: false, window: [] };
    expect(renderDirectorPrompt(base)).not.toContain("PLAYER");
    const withHandBack = renderDirectorPrompt({ ...base, handBack: true, playerName: "Rell" });
    expect(withHandBack).toContain("SPEAKER: <Captain Mara | PLAYER>");
    expect(withHandBack).toContain("Rell should act next");
  });
});

describe("parseDirectorResponse", () => {
  const candidates = [candidate("guard", "Captain Mara"), candidate("sage", "Elder Finn")];

  it("parses the SPEAKER line by the member's name", () => {
    expect(parseDirectorResponse("SPEAKER: Captain Mara", candidates, false)).toEqual({ rosterId: "guard" });
    expect(parseDirectorResponse("speaker = elder finn", candidates, false)).toEqual({ rosterId: "sage" });
  });

  it("does not resolve a word that is only some member's roster id", () => {
    const nameless = [candidate("maid", "Shiya"), candidate("dm", "dm")];
    expect(parseDirectorResponse("SPEAKER: maid", nameless, false)).toBeNull();
    expect(parseDirectorResponse("SPEAKER: Shiya", nameless, false)).toEqual({ rosterId: "maid" });
    expect(parseDirectorResponse("SPEAKER: dm", nameless, false)).toEqual({ rosterId: "dm" });
  });

  it("tolerates quotes, emphasis, and a bare answer", () => {
    expect(parseDirectorResponse('SPEAKER: "Elder Finn".', candidates, false)).toEqual({ rosterId: "sage" });
    expect(parseDirectorResponse("Captain Mara", candidates, false)).toEqual({ rosterId: "guard" });
  });

  it("honors NONE only when silence is allowed", () => {
    expect(parseDirectorResponse("SPEAKER: NONE", candidates, true)).toEqual({ rosterId: null });
    expect(parseDirectorResponse("SPEAKER: NONE", candidates, false)).toBeNull();
  });

  it("reads PLAYER as a hand-back only when it was offered", () => {
    expect(parseDirectorResponse("SPEAKER: PLAYER", candidates, false, true)).toEqual({ rosterId: null, handBack: true });
    expect(parseDirectorResponse("SPEAKER: the player", candidates, false, true)).toEqual({ rosterId: null, handBack: true });
    expect(parseDirectorResponse("SPEAKER: PLAYER", candidates, false, false)).toBeNull();
  });

  it("returns null for unknown names or junk", () => {
    expect(parseDirectorResponse("SPEAKER: Ghost", candidates, true)).toBeNull();
    expect(parseDirectorResponse("I think several could speak.\nMaybe both.", candidates, true)).toBeNull();
  });

  it("skips channel noise wrappers", () => {
    expect(parseDirectorResponse("<|channel|>final<|message|>SPEAKER: Elder Finn<|end|>", candidates, false)).toEqual({ rosterId: "sage" });
  });
});
