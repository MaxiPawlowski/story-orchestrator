import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryOrThrow } from "@engine/index";
import { mergeExpansions } from "@generation/merge";
import { parseGeneratedBeats } from "@generation/parse";

const root = join(__dirname, "../..");

const saga = (talk: boolean) => {
  const raw = JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf8"));
  raw.checkpoints = raw.checkpoints.map((checkpoint: { id: string }) =>
    (checkpoint.id === "bridge_stub" && talk ? { ...checkpoint, talk_control: { profile: "conversation", budget: { voices: 2 } } } : checkpoint));
  return raw;
};

const generated = (raw: unknown) => {
  const parsed = parseGeneratedBeats(readFileSync(join(root, "test/goldens/background-generator1.response.txt"), "utf8"), parseStoryOrThrow(raw));
  expect(parsed.issues).toEqual([]);
  const story = mergeExpansions(raw, { bridge: { status: "inserted", sourceCheckpointId: "start", stubId: "bridge_stub", targetAnchorId: "finish", beats: parsed.beats } } as never);
  return story.checkpoints.filter((checkpoint) => checkpoint.id.startsWith("gen_bridge_stub_"));
};

describe("v3.0 19 talk fixes C: a generated stretch plays its stub's talk control", () => {
  it("every generated beat carries a copy of the stub's talk_control", () => {
    const beats = generated(saga(true));
    expect(beats.length).toBeGreaterThan(1);
    beats.forEach((beat) => expect(beat.talk_control).toEqual({ profile: "conversation", budget: { voices: 2 } }));
    expect(beats[0].talk_control).not.toBe(beats[1].talk_control);
  });

  it("control: a stub without talk_control leaves the generated beats without one", () => {
    expect(generated(saga(false)).every((beat) => beat.talk_control === undefined)).toBe(true);
  });
});
