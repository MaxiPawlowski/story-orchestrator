import { defaultPresenceSettings, sanitizePresenceSettings, shownFor } from "./displayToggles";
import type { PlayedProjection } from "./playerProjection";
import { buildSuggestionPrompt, fillRefusal, parseSuggestions, SUGGESTION_COUNT, SUGGESTION_RULES, suggestionsUsable } from "./suggestions";

const projection: PlayedProjection = {
  title: "The Ferry", intro: null, player: "Max", visited: ["The Dock"], current: { name: "The Dock", text: null },
  sections: [{ id: "now", label: "Where you are", lines: ["The Dock"] }], cast: ["Ferryman"],
  transcript: [{ speaker: "Ferryman", text: "Two coins." }, { speaker: "Max", text: "I pay him." }],
};

describe("v2.7 33 W4: the suggestion prompt and parser", () => {
  it("asks for four lines in the player's voice under the agency rule, over the projection only", () => {
    const prompt = buildSuggestionPrompt(projection);
    expect(prompt).toContain(`exactly ${SUGGESTION_COUNT} short things Max could do or say next`);
    for (const rule of SUGGESTION_RULES) expect(prompt).toContain(rule);
    expect(prompt).toContain("Ferryman: Two coins.");
  });

  it("strips bullets, numbers and quotes, drops preambles, duplicates and the player's own last line, and keeps four", () => {
    const text = "Here are some ideas:\n1. I haggle.\n2) \"Is it safe?\"\n- I pay him.\n* I haggle.\n• I look at the fog.\n- I wait.\n- I leave.";
    expect(parseSuggestions(text, projection)).toEqual(["I haggle.", "Is it safe?", "I look at the fog.", "I wait."]);
    expect(suggestionsUsable(["a", "b"])).toBe(false);
    expect(suggestionsUsable(["a", "b", "c"])).toBe(true);
  });

  it("fill-in truth table: same chat and an empty or unchanged box fills; a typed box or another chat refuses", () => {
    expect(fillRefusal({ chatAtAsk: "a", chatNow: "a", boxAtAsk: "", boxNow: "" })).toBeNull();
    expect(fillRefusal({ chatAtAsk: "a", chatNow: "a", boxAtAsk: "draft", boxNow: "draft" })).toBeNull();
    expect(fillRefusal({ chatAtAsk: "a", chatNow: "a", boxAtAsk: "draft", boxNow: "  " })).toBeNull();
    expect(fillRefusal({ chatAtAsk: "a", chatNow: "a", boxAtAsk: "", boxNow: "I draw" })).toBe("box-changed");
    expect(fillRefusal({ chatAtAsk: "a", chatNow: "b", boxAtAsk: "", boxNow: "" })).toBe("chat-changed");
  });
});

describe("v2.7 33 W4: the suggestions display toggle", () => {
  it("defaults on, and is shown only when both the story and the install allow it", () => {
    expect(defaultPresenceSettings().suggestions).toBe(true);
    expect(sanitizePresenceSettings({ suggestions: false }).suggestions).toBe(false);
    const on = defaultPresenceSettings();
    const off = { ...on, suggestions: false };
    expect(shownFor(undefined, on, "suggestions")).toBe(true);
    expect(shownFor({ suggestions: false }, on, "suggestions")).toBe(false);
    expect(shownFor(undefined, off, "suggestions")).toBe(false);
    expect(shownFor({ suggestions: true }, off, "suggestions")).toBe(false);
  });
});
