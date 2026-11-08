import { isRefusal } from "./summaryGuard";

const PASSAGE = "Mara drew her blade. Kel laughed at Mara. Kel stepped back as Mara advanced on the bridge.";

describe("harvest 2026-11-08: a refusal is never kept as a summary", () => {
  it("catches a plain refusal, a declined marker and a reply about the text instead of the story", () => {
    expect(isRefusal("I'm sorry, but I can't summarize this content.", PASSAGE)).toBe(true);
    expect(isRefusal("I cannot help with that request.", PASSAGE)).toBe(true);
    expect(isRefusal("Summary pending. <declined>policy</declined>", PASSAGE)).toBe(true);
    expect(isRefusal("The passage describes a confrontation that this text does not let me retell.", PASSAGE)).toBe(true);
  });

  it("keeps a real summary, including quoted in-story refusals", () => {
    expect(isRefusal("Mara drew her blade on the bridge while Kel laughed and stepped back.", PASSAGE)).toBe(false);
    expect(isRefusal("Kel told Mara \"I can't help you\" and left her on the bridge.", PASSAGE)).toBe(false);
    expect(isRefusal("Mara faced Kel; the text of the old oath was carved on the bridge.", PASSAGE)).toBe(false);
  });

  it("does not guess when the passage has no recurring names", () => {
    expect(isRefusal("The text is short.", "Rain fell.")).toBe(false);
  });
});
