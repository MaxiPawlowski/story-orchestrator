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
    expect(evidenceInWindow("the gate … the gate", window)).toBe(false);
  });

  // V14: the span is made of whole words. A substring used to count, so a one-letter quote was found
  // in almost any message.
  it("rejects a quote that is only part of a word", () => {
    expect(evidenceInWindow("e", ["Her eyes narrowed."])).toBe(false);
    expect(evidenceInWindow("yes", ["Her eyes narrowed."])).toBe(false);
    expect(evidenceInWindow("cross", window)).toBe(false);
    expect(evidenceInWindow("ate was open", window)).toBe(false);
    expect(evidenceInWindow("We crossed at da … the gate", window)).toBe(false);
  });

  it("control: the same words, whole, are found", () => {
    expect(evidenceInWindow("eyes", ["Her eyes narrowed."])).toBe(true);
    expect(evidenceInWindow("the gate was open", window)).toBe(true);
    expect(evidenceInWindow("We crossed at dawn … the gate", window)).toBe(true);
  });

  it("treats dashes and brackets as word breaks on both sides", () => {
    expect(evidenceInWindow("the road—washed out", ["The road (washed out) was closed."])).toBe(true);
    expect(evidenceInWindow("north-west", ["They rode north-west."])).toBe(true);
    expect(evidenceInWindow("north", ["They rode north-west."])).toBe(false);
  });

  it("rejects empty evidence", () => {
    expect(evidenceInWindow("", window)).toBe(false);
    expect(evidenceInWindow("   .  ", window)).toBe(false);
    expect(evidenceInWindow("crossed", [])).toBe(false);
  });
});

describe("evidenceInWindow over markdown emphasis (v2.4 A35, J7 post-freeze)", () => {
  const narration = [
    "*The air inside the Guildhall is thick with the scent of ale, sweat and old parchment.* Arin leans on the board.",
    "Luke's eyes dart around the crowded tavern. _He swallows hard._ \"Take me with you.\"",
    "**The chamber feels both wondrous and dangerous**, a testament to a lost age.",
  ];

  it("accepts a quote that starts or ends at an emphasis boundary", () => {
    expect(evidenceInWindow("The air inside the Guildhall is thick with the scent of ale, sweat and old parchment.", narration)).toBe(true);
    expect(evidenceInWindow("He swallows hard", narration)).toBe(true);
    expect(evidenceInWindow("The chamber feels both wondrous and dangerous, a testament", narration)).toBe(true);
  });

  it("accepts a quote that keeps the model's own emphasis marks", () => {
    expect(evidenceInWindow("*The air inside the Guildhall is thick*", narration)).toBe(true);
  });

  it("control: emphasis stripping does not make a paraphrase or a stitched quote evidence", () => {
    expect(evidenceInWindow("The air in the Guildhall is thick", narration)).toBe(false);
    expect(evidenceInWindow("old parchment Luke's eyes dart", narration)).toBe(false);
  });
});
