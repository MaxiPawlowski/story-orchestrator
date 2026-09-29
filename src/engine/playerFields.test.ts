import { parseStoryV2, isValidationErrorList } from "./index";

const story = () => ({
  format: 2, title: "The Road", description: "Author notes", qualities: [], transitions: [], roster: [],
  checkpoints: [{ id: "start", name: "The betrayal", objective: "Reveal the hidden traitor", type: "anchor", start: true }],
});

describe("portable public copy and illustration direction", () => {
  it("keeps player copy explicit and round-trips story image intent", () => {
    const parsed = parseStoryV2({
      ...story(), player_intro: "A road through the forest.",
      illustrations: { checkpoints: true, scenes: true, style: "Watercolor at dusk", appearances: { guide: "red cloak" } },
      checkpoints: [{ ...story().checkpoints[0], player_name: "The forest", player_text: "The road forks." }],
    });
    expect(isValidationErrorList(parsed)).toBe(false);
    if (isValidationErrorList(parsed)) return;
    expect(parsed.player_intro).toBe("A road through the forest.");
    expect(parsed.checkpointById.start.player_name).toBe("The forest");
    expect(parsed.checkpointById.start.player_text).toBe("The road forks.");
    expect(parsed.illustrations).toEqual({ checkpoints: true, scenes: true, style: "Watercolor at dusk", appearances: { guide: "red cloak" } });
    expect(parseStoryV2(story())).not.toHaveProperty("player_intro");
    expect(parseStoryV2(story())).not.toHaveProperty("illustrations");
  });

  it("refuses malformed public fields rather than exposing internal copy", () => {
    const result = parseStoryV2({ ...story(), player_intro: 42, illustrations: { scenes: "yes" }, checkpoints: [{ ...story().checkpoints[0], player_text: 17 }] });
    expect(isValidationErrorList(result)).toBe(true);
    if (!isValidationErrorList(result)) return;
    expect(result.map((error) => error.path)).toEqual(expect.arrayContaining(["player_intro", "illustrations.scenes", "checkpoints.0.player_text"]));
  });
});
