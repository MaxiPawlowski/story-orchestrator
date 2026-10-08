import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2, type NormalizedStoryV2, type RosterMember } from "@engine/index";
import { buildCandidates, parseDirectorResponse, renderDirectorPrompt, type TalkCandidate } from "./index";
import { nameMatcher } from "./aliases";

const candidate = (rosterId: string, name: string, aliases?: string[]): TalkCandidate => ({ rosterId, name, weight: 1, ...(aliases ? { aliases } : {}) });

const pool = [
  candidate("dm", "Adolion Narrator", ["Narrator"]),
  candidate("companion_b", "Dalan", ["Dalan Evergreen", "little brother"]),
  candidate("guildmaster", "Vallie", ["Guildmaster", "the one-eyed minotaur"]),
  candidate("guild_rep", "Tobias", ["the receptionist"]),
  candidate("guild_girl", "Ellie", ["the receptionist"]),
];

const prompt = (candidates: TalkCandidate[]) => renderDirectorPrompt({
  storyTitle: "Adolion", checkpointName: "The Guild Hall", objective: "Take a posting.", candidates, allowSilence: false, lead: "Adolion Narrator",
  window: [{ speaker: "Max", text: "Little brother, what do you make of this posting?" }],
});

describe("SP3.b: roster aliases in the director prompt", () => {
  it("lists each candidate's aliases beside it", () => {
    const text = prompt(pool);
    expect(text).toContain("- Dalan (also called: Dalan Evergreen, little brother)");
    expect(text).toContain("- Vallie (also called: Guildmaster, the one-eyed minotaur)");
  });

  it("never shows an alias two candidates share, so the prompt cannot suggest a guess", () => {
    const text = prompt(pool);
    expect(text).not.toContain("the receptionist");
    expect(text).toContain("- Tobias\n");
  });

  it("an alias that is another candidate's name is never shown", () => {
    const text = prompt([candidate("a", "Belle", ["Dalan"]), candidate("b", "Dalan")]);
    expect(text).not.toContain("also called");
  });

  it("control: a pool without aliases or roles keeps today's one-line candidate list", () => {
    expect(prompt([candidate("a", "Belle"), candidate("b", "Dalan")])).toContain("Candidates: Belle, Dalan");
  });

  it("the answer line still asks for the listed name", () => {
    expect(prompt(pool)).toContain("SPEAKER: <Adolion Narrator | Dalan | Vallie | Tobias | Ellie>");
  });
});

describe("SP3.b: one resolver for SPEAKER answers", () => {
  it.each([
    ["SPEAKER: Dalan Evergreen", "companion_b"],
    ["SPEAKER: little brother", "companion_b"],
    ["SPEAKER: Little Brother.", "companion_b"],
    ["SPEAKER: the Guildmaster", "guildmaster"],
    ["SPEAKER: Guildmaster (she runs the hall)", "guildmaster"],
    ["SPEAKER: Narrator", "dm"],
    ["SPEAKER: Vallie", "guildmaster"],
  ])("%s resolves to %s", (answer, rosterId) => {
    expect(parseDirectorResponse(answer, pool, false)).toEqual({ rosterId });
  });

  it("an alias two candidates share never resolves by guess", () => {
    expect(parseDirectorResponse("SPEAKER: the receptionist", pool, false)).toBeNull();
  });

  it("an alias of a member outside the pool resolves to nothing", () => {
    expect(parseDirectorResponse("SPEAKER: little brother", pool.filter((entry) => entry.rosterId !== "companion_b"), false)).toBeNull();
  });

  it("a name still beats an alias that happens to spell it", () => {
    expect(parseDirectorResponse("SPEAKER: Dalan", [candidate("a", "Belle", ["Dalan"]), candidate("b", "Dalan")], false)).toEqual({ rosterId: "b" });
  });

  it("control: without aliases the parser misses exactly as before", () => {
    const bare = pool.map(({ aliases: _aliases, ...rest }) => rest);
    expect(parseDirectorResponse("SPEAKER: little brother", bare, false)).toBeNull();
  });
});

describe("SP3.b: roster aliases reach the candidates", () => {
  const story = (roster: unknown) => parseStoryV2({
    format: 2, id: "aliases", title: "Aliases", description: "SP3.b", qualities: [],
    checkpoints: [{ id: "a", name: "A", objective: "Start.", type: "anchor", start: true }], transitions: [], roster,
  });

  it("a roster member keeps its aliases, trimmed and deduplicated, its own name dropped", () => {
    const parsed = story([{ id: "companion_b", name: "Dalan", aliases: [" Dalan Evergreen ", "dalan evergreen", "Dalan", "", "little brother"] }]) as NormalizedStoryV2;
    expect(parsed.roster[0].aliases).toEqual(["Dalan Evergreen", "little brother"]);
  });

  it("refuses aliases that are not a list of text", () => {
    const parsed = story([{ id: "companion_b", name: "Dalan", aliases: "Dalan Evergreen" }]);
    expect(Array.isArray(parsed) ? parsed.map((error) => error.path) : []).toContain("roster.0.aliases");
  });

  it("buildCandidates carries a member's aliases", () => {
    const roster: RosterMember[] = [{ id: "companion_b", name: "Dalan", aliases: ["little brother"] }];
    expect(buildCandidates({}, roster, ["companion_b"])).toEqual([{ rosterId: "companion_b", name: "Dalan", weight: 1, aliases: ["little brother"] }]);
  });
});

const pin = JSON.parse(readFileSync(join(__dirname, "../../scripts/debug/adolion-fresh.pin.json"), "utf8")) as { repo: string; commit: string };
const labAt = (path: string): unknown => {
  if (!existsSync(pin.repo)) return null;
  try {
    return JSON.parse(execFileSync("git", ["-C", pin.repo, "show", `${pin.commit}:lab/aliases/${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return null;
  }
};

interface LabRow { id: string; answer: string; intended: string | null; acceptable: string[]; input: { candidates: Array<{ rosterId: string; name: string }> } }
const director = labAt("director.json") as { rows: LabRow[] } | null;
const aliases = labAt("aliases.json") as { roster: Array<{ id: string; ship?: string[] }> } | null;

(director && aliases ? describe : describe.skip)("SP3.b offline: the lab's authored SPEAKER answers through the resolver (information, not the Phase B bar)", () => {
  const ship = new Map((aliases?.roster ?? []).map((member) => [member.id, member.ship ?? []]));
  const rows = director?.rows ?? [];
  const resolve = (row: LabRow, withAliases: boolean) => {
    const candidates = row.input.candidates.map((entry) => ({ ...entry, weight: 1, ...(withAliases ? { aliases: ship.get(entry.rosterId) ?? [] } : {}) }));
    const verdict = parseDirectorResponse(row.answer, candidates, false);
    return verdict ? candidates.find((entry) => entry.rosterId === verdict.rosterId)?.name ?? null : null;
  };
  const score = (withAliases: boolean) => rows.reduce((totals, row) => {
    const pick = resolve(row, withAliases);
    if (pick === null) totals.miss += 1;
    else if (row.acceptable.includes(pick)) totals.right += 1;
    else totals.wrong += 1;
    return totals;
  }, { right: 0, wrong: 0, miss: 0 });

  it("resolves more answers than exact matching and never picks a member the answer did not mean", () => {
    const before = score(false);
    const after = score(true);
    console.log(`SP3.b offline resolver on ${rows.length} lab answers: exact ${JSON.stringify(before)}, aliases ${JSON.stringify(after)}`);
    expect(rows.length).toBe(174);
    expect(after.right).toBeGreaterThan(before.right);
    expect(after.wrong).toBeLessThanOrEqual(before.wrong);
  });
});

describe("nameMatcher (v2.7 41 P3: who a message names)", () => {
  const named = nameMatcher([
    candidate("a", "Kael Varro", ["the Hound"]),
    candidate("b", "Kael Mirn"),
    candidate("c", "Lady Sela", ["Hound"]),
    candidate("d", "Oren", ["the Fence"]),
  ]);

  it("names by full name or a distinct alias, case-insensitively, at word edges, possessive included", () => {
    expect(named("kael varro’s knife")).toEqual(["a"]);
    expect(named("Ask the FENCE.")).toEqual(["d"]);
    expect(named("Orenburg is far.")).toEqual([]);
  });

  it("a given name counts only when one member owns it and it is written as a name; a shared alias or a title never counts", () => {
    expect(named("Kael waits.")).toEqual([]);
    expect(named("Sela waits.")).toEqual(["c"]);
    expect(named("sela waits.")).toEqual([]);
    expect(named("The Lady waits.")).toEqual([]);
    expect(named("The hound barks.")).toEqual([]);
  });
});
