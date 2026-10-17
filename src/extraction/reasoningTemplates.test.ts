import { stripChannelNoise, stripReasoningBlocks } from "./parse";

const TEMPLATES: Record<string, { prefix: string; suffix: string; separator: string }> = {
  DeepSeek: { prefix: "<think>\n", suffix: "\n</think>", separator: "\n\n" },
  "Gemma 4": { prefix: "<|channel>thought\n", suffix: "<channel|>", separator: "\n\n" },
  "OpenAI Harmony": { prefix: "<|start|>assistant<|channel|>analysis<|message|>", suffix: "<|start|>assistant<|channel|>final<|message|>", separator: "" },
  "Think XML": { prefix: "<think>", suffix: "</think>", separator: "\n" },
};

const THOUGHT = "REASONING-LEAK: the guard is secretly the heir.";
const ANSWER = "DELTA seen_gate=true evidence=\"they reach the gate\"";

const wrapped = (template: { prefix: string; suffix: string; separator: string }) => `${template.prefix}${THOUGHT}${template.suffix}${template.separator}${ANSWER}`;

const leaks = (strip: (raw: string) => string) => Object.fromEntries(Object.entries(TEMPLATES).map(([name, template]) => {
  const out = strip(wrapped(template));
  return [name, out.includes("REASONING-LEAK") ? "leaks" : out.includes(ANSWER) ? "clean" : "answer lost"];
}));

describe("v2.8 35 G10: inline reasoning in each of ST's shipped reasoning templates (default/content/presets/reasoning)", () => {
  it("recorded: what the read's reasoning strip leaves", () => {
    expect(leaks(stripReasoningBlocks)).toEqual(RECORDED_STRIP);
  });

  it("recorded: what the channel-noise strip leaves", () => {
    expect(leaks(stripChannelNoise)).toEqual(RECORDED_CHANNEL);
  });
});

const RECORDED_STRIP: Record<string, string> = { DeepSeek: "clean", "Gemma 4": "clean", "OpenAI Harmony": "clean", "Think XML": "clean" };
const RECORDED_CHANNEL: Record<string, string> = { DeepSeek: "clean", "Gemma 4": "clean", "OpenAI Harmony": "clean", "Think XML": "clean" };
