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
});

describe("parseDirectorResponse", () => {
  const candidates = [candidate("guard", "Captain Mara"), candidate("sage", "Elder Finn")];

  it("parses the SPEAKER line by name or roster id", () => {
    expect(parseDirectorResponse("SPEAKER: Captain Mara", candidates, false)).toEqual({ rosterId: "guard" });
    expect(parseDirectorResponse("speaker = sage", candidates, false)).toEqual({ rosterId: "sage" });
  });

  it("tolerates quotes, emphasis, and a bare answer", () => {
    expect(parseDirectorResponse('SPEAKER: "Elder Finn".', candidates, false)).toEqual({ rosterId: "sage" });
    expect(parseDirectorResponse("Captain Mara", candidates, false)).toEqual({ rosterId: "guard" });
  });

  it("honors NONE only when silence is allowed", () => {
    expect(parseDirectorResponse("SPEAKER: NONE", candidates, true)).toEqual({ rosterId: null });
    expect(parseDirectorResponse("SPEAKER: NONE", candidates, false)).toBeNull();
  });

  it("returns null for unknown names or junk", () => {
    expect(parseDirectorResponse("SPEAKER: Ghost", candidates, true)).toBeNull();
    expect(parseDirectorResponse("I think several could speak.\nMaybe both.", candidates, true)).toBeNull();
  });

  it("skips channel noise wrappers", () => {
    expect(parseDirectorResponse("<|channel|>final<|message|>SPEAKER: Elder Finn<|end|>", candidates, false)).toEqual({ rosterId: "sage" });
  });
});
