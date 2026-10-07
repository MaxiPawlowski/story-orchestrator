import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { buildFixtureRun, CURRENT_VALUES_HEADER, withCurrentValues } from "./fixtureRun";

const story = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8"));
const transcript = [
  { index: 0, speaker: "You", text: "What is on your mind?", is_user: true },
  { index: 1, speaker: "Arin", text: "The market is loud today." },
];
const relKeys = (keys: string[]) => keys.filter((key) => key.startsWith("rel_"));
const relSource = (run: ReturnType<typeof buildFixtureRun>) => run.sources.find((source) => source.kind === "relationship");

beforeAll(async () => {
  await loadGameLayer();
});

describe("fixture run measurement arms (v2.7 39 B1 runners)", () => {
  it("leaves the shipped prompt unchanged when no arm field is set", () => {
    const plain = buildFixtureRun({ story, transcript });
    const empty = buildFixtureRun({ story, transcript, scopeCaps: {}, scopeContext: {}, showValues: false });
    expect(empty.prompt).toBe(plain.prompt);
    expect(plain.prompt).not.toContain(CURRENT_VALUES_HEADER);
  });

  it("caps a scope source the way the arm asks, and reports what each source kept and dropped", () => {
    const uncapped = buildFixtureRun({ story, transcript, scopeCaps: { relationship: null } });
    const one = buildFixtureRun({ story, transcript, scopeCaps: { relationship: 1 } });
    const none = buildFixtureRun({ story, transcript, scopeCaps: { relationship: 0 } });
    const all = relKeys(uncapped.scope.map((entry) => entry.key));
    expect(all.length).toBeGreaterThan(1);
    expect(relKeys(one.scope.map((entry) => entry.key))).toHaveLength(1);
    expect(relSource(none)?.keys).toEqual([]);
    const read = one.sources.find((source) => source.kind === "relationship");
    expect(read).toMatchObject({ cap: 1 });
    expect(read?.keys).toHaveLength(1);
    expect(read?.dropped.length).toBeGreaterThan(0);
  });

  it("reads the scope context: a member who is not present brings no axes", () => {
    const present = buildFixtureRun({ story, transcript, scopeCaps: { relationship: null }, scopeContext: { present: ["arin", "narrator"], drafted: "arin" } });
    const absent = buildFixtureRun({ story, transcript, scopeCaps: { relationship: null }, scopeContext: { present: ["narrator"] } });
    expect(relSource(present)?.keys.length).toBeGreaterThan(0);
    expect(relSource(absent)?.keys).toEqual([]);
  });

  it("shows the current values only in the value-shown arm, before the transcript", () => {
    const key = relKeys(buildFixtureRun({ story, transcript }).scope.map((entry) => entry.key))[0];
    const shown = buildFixtureRun({ story, transcript, showValues: true, blackboard: { values: { [key]: 2 }, versions: {}, latched: {} } });
    expect(shown.prompt).toContain(CURRENT_VALUES_HEADER);
    expect(shown.prompt).toContain(`- ${key} = 2`);
    expect(shown.prompt.indexOf(CURRENT_VALUES_HEADER)).toBeLessThan(shown.prompt.lastIndexOf("\nTranscript:\n"));
    expect(withCurrentValues("no transcript here", shown.scope, {})).toBe("no transcript here");
  });
});
