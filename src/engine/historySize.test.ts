import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLLBACK_HORIZON, StoryEngine, parseStoryV2OrThrow } from "@engine/index";

// V11: the engine persists up to ROLLBACK_HORIZON full states with every save, and the audit found
// the size had never been measured. Measured here over the shipped sun-ruins story, one delta per
// boundary, the horizon full. The budget is the measurement with headroom, so a change that makes
// each retained state heavier fails here before it reaches a player's chat file.
const HISTORY_BUDGET_BYTES = 400_000;

const sunRuins = () => parseStoryV2OrThrow(JSON.parse(readFileSync(join(__dirname, "../../examples/sun-ruins/quest-for-the-sun-ruins.json"), "utf-8")));

function fullHorizon(boundaries: number) {
  const story = sunRuins();
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const extractor = story.qualities.filter((quality) => quality.source === "extractor" && (quality.type === "int" || quality.type === "number"));
  for (let i = 0; i < boundaries; i += 1) {
    const quality = extractor[i % Math.max(1, extractor.length)];
    engine.enqueue({ source: "extractor", blackboardVersionSum: i, turnRange: { from: i, to: i }, deltas: quality ? [{ q: quality.key, v: i % 5, source: "extractor" }] : [] });
    engine.commitBoundary({ lastMessageId: i, chatLength: i + 1 });
  }
  return engine;
}

describe("V11: the persisted engine history", () => {
  it("stays inside its budget with the horizon full", () => {
    const bytes = JSON.stringify(fullHorizon(ROLLBACK_HORIZON + 20).serializeHistory()).length;
    process.stdout.write(`[V11] engine history at ${ROLLBACK_HORIZON} boundaries: ${bytes} bytes\n`);
    expect(bytes).toBeLessThan(HISTORY_BUDGET_BYTES);
  });

  it("control: a short history is small, so the budget is measuring growth", () => {
    expect(JSON.stringify(fullHorizon(10).serializeHistory()).length).toBeLessThan(HISTORY_BUDGET_BYTES / 10);
  });
});
