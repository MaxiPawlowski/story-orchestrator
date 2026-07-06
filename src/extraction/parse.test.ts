import { stripChannelNoise } from "./parse";

describe("stripChannelNoise", () => {
  it("extracts the final harmony channel and drops the analysis reasoning", () => {
    const raw = "<|channel|>analysis<|message|>The player clearly opened it.<|end|><|channel|>final<|message|>The vault stands open and the crew slips inside.<|return|>";
    expect(stripChannelNoise(raw)).toBe("The vault stands open and the crew slips inside.");
  });

  it("strips residual channel tokens and bracket markers from plain output", () => {
    expect(stripChannelNoise("[0]<|assistant|>The report is ready.")).toBe("The report is ready.");
  });

  it("leaves clean prose untouched", () => {
    expect(stripChannelNoise("The story stands at a crossroads.")).toBe("The story stands at a crossroads.");
  });
});
