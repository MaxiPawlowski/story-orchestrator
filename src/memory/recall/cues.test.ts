import { recallCue } from "./cues";

const NAMES = ["Corvin", "Tamsin", "Hollis"];

describe("plan 43 §5: deterministic quotation cues on the player's last line", () => {
  it.each([
    ["What exactly did she promise?", "exactly"],
    ["Repeat it word for word.", "word for word"],
    ["What did Tamsin say about the ferry?", "what did name say"],
    ["what did corvin just say", "what did name say"],
    ["Tell me in your own words.", "your words"],
    ["Use your words, Hollis.", "your words"],
    ["You said the bridge was safe.", "you said"],
    ["Can you quote him?", "quote"],
  ])("fires on %j", (line, cue) => {
    expect(recallCue(line, NAMES)?.cue).toBe(cue);
  });

  it("names the asked-about member", () => {
    expect(recallCue("Corvin, what did Hollis say at the gate?", NAMES)).toEqual({ cue: "what did name say", name: "Hollis" });
  });

  it.each([
    "Let us head down to the mill before the rain.",
    "What did the innkeeper say?",
    "The price was quoted at nine silver.",
    "Your sword is dull.",
    "I said nothing at all.",
    "That was inexact at best.",
    "What did you see by the river?",
    "Words fail me.",
  ])("does not fire on %j", (line) => {
    expect(recallCue(line, NAMES)).toBeNull();
  });

  it("never fires for quiet or impersonate generations", () => {
    expect(recallCue("What exactly did Tamsin say?", NAMES, "quiet")).toBeNull();
    expect(recallCue("Quote him word for word.", NAMES, "impersonate")).toBeNull();
    expect(recallCue("What exactly did Tamsin say?", NAMES, "normal")?.cue).toBe("exactly");
    expect(recallCue("What exactly did Tamsin say?", NAMES, "swipe")?.cue).toBe("exactly");
  });
});
