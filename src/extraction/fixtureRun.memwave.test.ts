import * as fs from "node:fs";
import * as path from "node:path";
import { KEYS_FIELD, RELATION_RULES } from "@memory/contract";
import { NEIGHBOUR_HEADER } from "@memory/neighbours";
import { ACT_RULE } from "./contract";
import { buildFixtureRun, readMemoryFlags, type ExtractionFixtureSpec, type ReadMemoryFlags } from "./fixtureRun";
import { waveTiers } from "./fixtureWaveTiers";
import { parseSharedReadResponse } from "./parse";
import { readMemoryOf } from "../runtime/readMemoryPort";

const dir = path.join(process.cwd(), "test/fixtures");
const readJson = <T,>(file: string): T => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as T;
const MEMWAVE = fs.readdirSync(dir).filter((file) => /^memwave.*\.story\.json$/.test(file)).map((file) => file.replace(/\.story\.json$/, "")).sort();

interface Expected { spec?: Partial<ExtractionFixtureSpec>; deltas: Array<{ q: string; v: unknown; evidence: string }>; neighbours?: { same?: string[]; update?: string[] };
  relations?: { expect: Array<{ subject: string; object: string; ended?: boolean }> }; acts?: { expect: Array<{ q: string; act: string }> } }

const fixture = (name: string) => {
  const expected = readJson<Expected>(`${name}.expected.json`);
  const spec: ExtractionFixtureSpec = { story: readJson<unknown>(`${name}.story.json`), transcript: readJson<ExtractionFixtureSpec["transcript"]>(`${name}.transcript.json`), ...(expected.spec ?? {}) };
  return { expected, spec };
};

const ON: ReadMemoryFlags = { neighbours: true, keys: true, relations: true, acts: true };
const OFF: ReadMemoryFlags = { neighbours: false, keys: false, relations: false, acts: false };
const only = (flag: keyof ReadMemoryFlags): ReadMemoryFlags => ({ ...OFF, [flag]: true });

describe("v3.0 43 H2: the live suite's fixture read follows the memory wave 2 switches, like the product read", () => {
  test("six memwave fixtures, each with transcript and expected", () => {
    expect(MEMWAVE).toEqual(["memwave-m1-repeat", "memwave-m1-supersede", "memwave-m1-two-dogs", "memwave-m3-relations", "memwave-m4-acts", "memwave-m4-hearsay"]);
  });

  test.each(MEMWAVE)("%s: the off arm is byte-identical to a read built without memory, and the on arm differs", (name) => {
    const { spec } = fixture(name);
    const plain = buildFixtureRun(spec).prompt;
    expect(buildFixtureRun({ ...spec, readMemory: null }).prompt).toBe(plain);
    expect(buildFixtureRun({ ...spec, readMemory: OFF }).prompt).toBe(plain);
    expect(buildFixtureRun({ ...spec, readMemory: ON }).prompt).not.toBe(plain);
    expect(plain).not.toContain(NEIGHBOUR_HEADER);
    expect(plain).not.toContain(KEYS_FIELD);
    expect(plain).not.toContain(RELATION_RULES[1]);
    expect(plain).not.toContain(ACT_RULE);
  });

  test("each switch adds only its own part of the contract", () => {
    const dogs = fixture("memwave-m1-two-dogs").spec;
    const neighbours = buildFixtureRun({ ...dogs, readMemory: only("neighbours") });
    expect(neighbours.prompt).toContain(NEIGHBOUR_HEADER);
    expect(neighbours.prompt).toContain("[m1] Mira's dog Ash");
    expect(neighbours.prompt).toContain("[m2] Tobin's dog Pip");
    expect(neighbours.prompt).not.toContain(KEYS_FIELD);
    expect(neighbours.neighbours?.map((row) => row.id)).toEqual(["mem-ash", "mem-pip"]);
    expect(buildFixtureRun({ ...dogs, readMemory: only("keys") }).prompt).toContain(KEYS_FIELD);
    expect(buildFixtureRun({ ...dogs, readMemory: only("keys") }).prompt).not.toContain(NEIGHBOUR_HEADER);
    expect(buildFixtureRun({ ...dogs, readMemory: only("relations") }).prompt).toBe(buildFixtureRun(dogs).prompt);
    const relations = fixture("memwave-m3-relations").spec;
    expect(buildFixtureRun({ ...relations, readMemory: only("relations") }).prompt).toContain(RELATION_RULES[1]);
    expect(buildFixtureRun({ ...relations, epistemicLedgerCapable: false, readMemory: only("relations") }).prompt).not.toContain(RELATION_RULES[1]);
    const acts = fixture("memwave-m4-acts").spec;
    expect(buildFixtureRun({ ...acts, readMemory: only("acts") }).prompt).toContain(ACT_RULE);
    expect(buildFixtureRun({ ...dogs, readMemory: only("acts") }).prompt).not.toContain(ACT_RULE);
  });

  test("the arm flags are the product's: readMemoryOf over the memory settings, entries dropped", () => {
    const state = (settings: Record<string, unknown>) => () => ({ settings, entries: [] }) as never;
    expect(readMemoryFlags(readMemoryOf(state({}), (entries) => entries))).toEqual(ON);
    expect(readMemoryFlags(readMemoryOf(state({ neighbourRead: false, readKeys: false, relationRows: false, socialActs: false }), (entries) => entries))).toBeNull();
    expect(readMemoryFlags(readMemoryOf(state({ enabled: false }), (entries) => entries))).toEqual({ ...OFF, acts: true });
  });

  test.each(MEMWAVE)("%s: the hand-written ideal answer meets every expectation the fixture states", (name) => {
    const { expected, spec } = fixture(name);
    const run = buildFixtureRun({ ...spec, readMemory: ON });
    const golden = fs.readFileSync(path.join(process.cwd(), "test/goldens", `${name}.response.txt`), "utf8");
    const parsed = parseSharedReadResponse(golden, run.story);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.deltas.map((entry) => ({ q: entry.delta.q, v: entry.delta.v }))).toEqual(expected.deltas.map((entry) => ({ q: entry.q, v: entry.v })));
    for (const entry of expected.deltas) expect(parsed.deltas.find((delta) => delta.delta.q === entry.q)?.evidence).toContain(entry.evidence);
    const wave = waveTiers(parsed, run.story, run.window, run.neighbours);
    expect(wave.tagged.every((line) => line.id !== null)).toBe(true);
    for (const id of expected.neighbours?.same ?? []) expect(wave.tagged).toContainEqual(expect.objectContaining({ kind: "same", id }));
    for (const id of expected.neighbours?.update ?? []) expect(wave.tagged).toContainEqual(expect.objectContaining({ kind: "update", id }));
    expect(wave.relations.map((row) => [row.subject, row.object, row.ended])).toEqual((expected.relations?.expect ?? []).map((claim) => [claim.subject, claim.object, claim.ended === true]));
    expect(wave.acts).toEqual(expected.acts?.expect ?? []);
  });

  test("a player act without the player's own line loses its act, the feeling is kept, the drop is counted", () => {
    const { spec } = fixture("memwave-m4-hearsay");
    const run = buildFixtureRun({ ...spec, readMemory: ON });
    const parsed = parseSharedReadResponse([
      'DELTA q=rel_mira_player_trust value="down" act=lied evidence="Wren lied to you about the coins,"',
      'DELTA q=rel_mira_tobin_trust value="up" act=confided evidence="Wren lied to you about the coins,"',
    ].join("\n"), run.story);
    const wave = waveTiers(parsed, run.story, run.window, run.neighbours);
    expect(parsed.deltas.map((entry) => entry.delta.act)).toEqual(["lied", "confided"]);
    expect(wave.acts).toEqual([{ q: "rel_mira_tobin_trust", act: "confided" }]);
    expect(wave.actsDropped).toBe(1);
  });

  test("an alias the read never listed is reported as unknown, keys are counted per line", () => {
    const { spec } = fixture("memwave-m1-supersede");
    const run = buildFixtureRun({ ...spec, readMemory: ON });
    const parsed = parseSharedReadResponse('FACT importance=1 same=m9 keys="a,b" text="The attic is dusty." evidence="up to the attic."', run.story);
    const wave = waveTiers(parsed, run.story, run.window, run.neighbours);
    expect(wave.tagged).toEqual([{ text: "The attic is dusty.", kind: "same", id: null }]);
    expect(wave.keyed).toEqual([{ text: "The attic is dusty.", keys: ["a", "b"] }]);
    expect(wave.keyable).toBe(1);
  });
});
