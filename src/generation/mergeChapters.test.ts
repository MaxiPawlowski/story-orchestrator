import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow } from "@engine/index";
import { mergeExpansions } from "@generation/merge";
import { parseGeneratedBeats } from "@generation/parse";

const root = join(__dirname, "../..");

const chaptered = () => {
  const raw = JSON.parse(readFileSync(join(root, "test/fixtures/background-generation.story.json"), "utf8"));
  raw.chapters = [{ id: "road", title: "The Road" }, { id: "end", title: "The End", final: true }];
  raw.checkpoints = raw.checkpoints.map((checkpoint: { id: string }) => ({ ...checkpoint, chapter: checkpoint.id === "finish" ? "end" : "road" }));
  return raw;
};

describe("mergeExpansions in a story with chapters", () => {
  it("files every generated beat in its stub's chapter, so the merged story still parses", () => {
    const raw = chaptered();
    const story = parseStoryV2OrThrow(raw);
    const parsed = parseGeneratedBeats(readFileSync(join(root, "test/goldens/background-generator1.response.txt"), "utf8"), story);
    expect(parsed.issues).toEqual([]);
    const merged = mergeExpansions(raw, { bridge: { status: "inserted", sourceCheckpointId: "start", stubId: "bridge_stub", targetAnchorId: "finish", beats: parsed.beats } } as never);
    const generated = merged.checkpoints.filter((checkpoint) => checkpoint.id.startsWith("gen_bridge_stub_"));
    expect(generated.length).toBe(parsed.beats.length);
    expect(generated.every((checkpoint) => checkpoint.chapter === "road")).toBe(true);
    expect(merged.chapterByCheckpoint?.gen_bridge_stub_1).toBe("road");
  });
});
