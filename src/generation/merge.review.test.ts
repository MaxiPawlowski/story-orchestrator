// Promoted from the 2026-09-18 external review. R9: spec v2 line 111 says a generated beat's
// possible outcomes "become multiple outgoing gates, so generated beats branch". Merge keeps
// `outcomes[0]` only, so a player who takes the omitted route stalls or is steered back.
// v2.3 plan 01 §A.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow } from "@engine/index";
import { mergeExpansions } from "@generation/merge";
import { parseGeneratedBeats } from "@generation/parse";
import { control, finding, must } from "../../test/findings/ledger";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null, getContext: () => ({ chat: [], extensionSettings: {} }) }));

const root = join(__dirname, "../..");
const rawStory = () => JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf8"));

const parsedBeats = () => {
  const story = parseStoryV2OrThrow(rawStory());
  const parsed = parseGeneratedBeats(readFileSync(join(root, "test/goldens/background-generator1.response.txt"), "utf8"), story);
  expect(parsed.issues).toEqual([]);
  return { story, parsed };
};

const entryFor = (beats: unknown) => ({ review: { status: "inserted", sourceCheckpointId: "start", stubId: "bridge_stub", targetAnchorId: "finish", beats } }) as never;

control("a single-outcome generated beat produces its one transition", () => {
  const { parsed } = parsedBeats();
  const merged = mergeExpansions(rawStory(), entryFor(parsed.beats));
  expect(merged.outgoingByCheckpoint.gen_bridge_stub_1).toHaveLength(1);
});

finding("R9", () => {
  const { story, parsed } = parsedBeats();
  parsed.beats[0].outcomes.push({ ...parsed.beats[0].outcomes[0], label: "Alternative route", gate: { q: "approach", op: "==", v: "blocked" } });

  // The parser and the scope check agree with the spec: two outcomes validate cleanly.
  const revalidated = parseGeneratedBeats(JSON.stringify({ beats: parsed.beats }), story);
  expect(revalidated.issues).toEqual([]);
  expect(revalidated.beats[0].outcomes).toHaveLength(2);

  const merged = mergeExpansions(rawStory(), entryFor(parsed.beats));
  const outgoing = merged.outgoingByCheckpoint.gen_bridge_stub_1 ?? [];
  must(
    outgoing.length === 2,
    `a generated beat with two validated outcomes produced ${outgoing.length} outgoing transition(s): merge reads outcomes[0] only, so every alternative route the generator proposed is discarded and a player who takes it has nowhere to go`,
  );
});

describe("T0 finding 4: a generated step carries the player name of the stub it replaces", () => {
  it("names every generated beat after the stub, so the HUD never falls back to Current scene", () => {
    const { parsed } = parsedBeats();
    const raw = rawStory();
    raw.checkpoints = raw.checkpoints.map((checkpoint: { id: string }) => (checkpoint.id === "bridge_stub" ? { ...checkpoint, player_name: "Camp on the North Road" } : checkpoint));
    const merged = mergeExpansions(raw, entryFor(parsed.beats));
    const generated = merged.checkpoints.filter((checkpoint) => checkpoint.id.startsWith("gen_bridge_stub_"));
    expect(generated.length).toBeGreaterThan(0);
    expect(generated.every((checkpoint) => checkpoint.player_name === "Camp on the North Road")).toBe(true);
  });

  it("control: a stub without a player name leaves the beats unnamed for the player", () => {
    const { parsed } = parsedBeats();
    const merged = mergeExpansions(rawStory(), entryFor(parsed.beats));
    expect(merged.checkpoints.filter((checkpoint) => checkpoint.id.startsWith("gen_bridge_stub_")).some((checkpoint) => checkpoint.player_name)).toBe(false);
  });
});
