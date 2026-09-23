import { evidenceInWindow } from "./evidence";

const window = [
  "Arin buckled her armour and said the north road had washed out.",
  "\"We crossed at dawn,\" said Ponticius, \"and the gate was open.\"",
  "The guild paid us twelve crowns for the job.",
];

describe("evidenceInWindow", () => {
  it("accepts a contiguous span of one message", () => {
    expect(evidenceInWindow("the north road had washed out", window)).toBe(true);
  });

  it("accepts short legitimate evidence", () => {
    expect(evidenceInWindow("crossed", window)).toBe(true);
    expect(evidenceInWindow("yes", ["Yes."])).toBe(true);
  });

  it("ignores case, whitespace, quoting and punctuation differences", () => {
    expect(evidenceInWindow("  WE   crossed at dawn ", window)).toBe(true);
    expect(evidenceInWindow("the guild paid us twelve crowns", window)).toBe(true);
    // Quoting marks and the commas around them are noise; the words a speaker interposes are not,
    // so a quote that jumps over "said Ponticius" is not contiguous and needs an elision.
    expect(evidenceInWindow("We crossed at dawn and the gate was open", window)).toBe(false);
  });

  it("accepts an elision whose fragments are in order in the same message", () => {
    expect(evidenceInWindow("We crossed at dawn … the gate was open", window)).toBe(true);
    expect(evidenceInWindow("Arin buckled her armour … the north road", window)).toBe(true);
  });

  it("rejects a paraphrase", () => {
    expect(evidenceInWindow("the gate was unlocked when they arrived", window)).toBe(false);
    expect(evidenceInWindow("Arin put on her armour", window)).toBe(false);
  });

  it("rejects a quote that spans two messages", () => {
    expect(evidenceInWindow("washed out and we crossed at dawn", window)).toBe(false);
  });

  it("rejects a quote from outside the window", () => {
    expect(evidenceInWindow("the river ran red", window)).toBe(false);
  });

  it("rejects an elision whose fragments are out of order", () => {
    expect(evidenceInWindow("the gate was open … We crossed at dawn", window)).toBe(false);
  });

  it("rejects empty evidence", () => {
    expect(evidenceInWindow("", window)).toBe(false);
    expect(evidenceInWindow("   .  ", window)).toBe(false);
    expect(evidenceInWindow("crossed", [])).toBe(false);
  });
});
