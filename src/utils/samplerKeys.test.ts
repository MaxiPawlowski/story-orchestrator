import { applySamplerOverlay, resolveSamplerOverlay, SAMPLER_OVERLAY_NEVER } from "./samplerKeys";

describe("sampler overlay key map (v2.4 plan 06 seed A)", () => {
  it("maps a textgen preset's setting names onto every payload key ST sends for them", () => {
    const { values, unknown } = resolveSamplerOverlay({ temp: 0.7, top_p: 0.9, rep_pen: 1.1, rep_pen_range: 512, freq_pen: 0.2, preset: "Story", logit_bias: [] }, "textgen");
    expect(values).toEqual({ temperature: 0.7, top_p: 0.9, repetition_penalty: 1.1, rep_pen: 1.1, repeat_penalty: 1.1, rep_pen_range: 512, repetition_penalty_range: 512, repeat_last_n: 512, frequency_penalty: 0.2 });
    expect(unknown).toEqual(["preset", "logit_bias"]);
  });

  it("maps a chat-completion preset's _openai names, and plain payload names on either backend", () => {
    expect(resolveSamplerOverlay({ temp_openai: 0.6, top_p_openai: 0.8, freq_pen_openai: 0.1, pres_pen_openai: 0.3, top_k_openai: 40 }, "chat").values)
      .toEqual({ temperature: 0.6, top_p: 0.8, frequency_penalty: 0.1, presence_penalty: 0.3, top_k: 40 });
    expect(resolveSamplerOverlay({ temperature: 0.5 }, "chat").values).toEqual({ temperature: 0.5 });
    expect(resolveSamplerOverlay({ temperature: 0.5 }, "textgen").values).toEqual({ temperature: 0.5 });
  });

  it("reports a non-numeric sampler value instead of sending it", () => {
    expect(resolveSamplerOverlay({ temp: "hot", top_p: Number.NaN }, "textgen")).toEqual({ values: {}, unknown: ["temp", "top_p"] });
  });

  it("overwrites only keys the payload already carries, and says which it skipped", () => {
    const payload: Record<string, unknown> = { temperature: 1, top_p: 1, top_k: undefined, messages: ["m"] };
    expect(applySamplerOverlay(payload, { temperature: 0.7, top_p: 0.9, top_k: 40, presence_penalty: 0.2 })).toEqual({ applied: ["temperature", "top_p"], skipped: ["top_k", "presence_penalty"] });
    expect(payload).toEqual({ temperature: 0.7, top_p: 0.9, top_k: undefined, messages: ["m"] });
    expect("presence_penalty" in payload).toBe(false);
  });

  it("never touches prompt, model or routing keys, whatever the overlay says", () => {
    const payload: Record<string, unknown> = { messages: [], prompt: "p", stop: [], model: "m", chat_completion_source: "custom", temperature: 1 };
    const overlay = Object.fromEntries([...SAMPLER_OVERLAY_NEVER].map((key) => [key, 0]));
    expect(applySamplerOverlay(payload, { ...overlay, temperature: 0.4 }).applied).toEqual(["temperature"]);
    expect(payload).toMatchObject({ messages: [], prompt: "p", stop: [], model: "m", chat_completion_source: "custom" });
  });
});
