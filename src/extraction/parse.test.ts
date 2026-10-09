import { parseSharedReadResponse, stripChannelNoise, stripReasoningBlocks } from "./parse";

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

  it("drops a leading Think XML block", () => {
    expect(stripChannelNoise("<think>The player wants a recap. Keep it short.</think>\nThe vault stands open.")).toBe("The vault stands open.");
  });

  it("drops a multiline DeepSeek-style block and keeps every answer line", () => {
    const raw = "<think>\nFirst, list what happened.\nDELTA q=door_open value=true evidence=\"draft\"\n</think>\n\nThe crew slipped inside.\nMara kept watch.";
    expect(stripChannelNoise(raw)).toBe("The crew slipped inside.\nMara kept watch.");
  });

  it("drops <thinking> blocks case-insensitively", () => {
    expect(stripChannelNoise("<THINKING>\nweighing it up\n</Thinking>\nSPEAKER: Mara")).toBe("SPEAKER: Mara");
  });

  it("drops a Gemma 4 thought channel that has content", () => {
    expect(stripChannelNoise("<|channel>thought\nThe user wants a summary of the scene.\n<channel|>The party searched the ruins.")).toBe("The party searched the ruins.");
  });

  it("returns nothing when the response is only a reasoning block", () => {
    expect(stripChannelNoise("<think>\nStill deciding what the summary should say.\n</think>")).toBe("");
    expect(stripChannelNoise("  <think></think>  ")).toBe("");
    expect(stripChannelNoise("<|channel>thought\nOnly thoughts here.\n<channel|>")).toBe("");
  });

  it("drops an unterminated leading block, as when the token limit cuts reasoning short", () => {
    expect(stripChannelNoise("<think>\nThe scene opens in the ruins.\nThe summary should mention")).toBe("");
    expect(stripChannelNoise("<|channel>thought\nThe scene opens in the ruins.")).toBe("");
    expect(stripChannelNoise("<|channel|>analysis<|message|>The player clearly opened it.")).toBe("");
  });

  it("matches nested blocks by depth", () => {
    const raw = "<think>outer\n<think>inner\nstill inner</think>\nback in outer</think>\nThe vault stands open.";
    expect(stripChannelNoise(raw)).toBe("The vault stands open.");
  });

  it("survives a quoted opener or closer inside the reasoning", () => {
    expect(stripChannelNoise("<think>Do not emit <think> tags in the answer.</think>The vault stands open.")).toBe("The vault stands open.");
    expect(stripChannelNoise("<think>A literal </think> would end this early.\nKeep going.</think>\nThe vault stands open.")).toBe("The vault stands open.");
  });

  it("drops reasoning whose opener was prefilled by the prompt template", () => {
    expect(stripChannelNoise("The player asked for a recap.\n</think>\n\nThe vault stands open.")).toBe("The vault stands open.");
  });

  it("drops consecutive leading blocks and leading noise before them", () => {
    expect(stripChannelNoise("[0]<think>a</think>\n<thinking>b</thinking>\nThe vault stands open.")).toBe("The vault stands open.");
  });

  it("keeps a block that is not leading", () => {
    expect(stripChannelNoise("The scribe wrote <think>twice</think> on the wall.")).toBe("The scribe wrote <think>twice</think> on the wall.");
  });

  it("keeps the final harmony channel when the analysis channel has no end token", () => {
    expect(stripChannelNoise("<|channel|>analysis<|message|>Weighing it.<|start|>assistant<|channel|>final<|message|>The vault stands open.<|return|>")).toBe("The vault stands open.");
  });
});

describe("stripReasoningBlocks", () => {
  it("returns clean text byte-for-byte", () => {
    const raw = "  {\n  \"ops\": []\n}\n";
    expect(stripReasoningBlocks(raw)).toBe(raw);
  });

  it("leaves stray Gemma channel tokens to the line parser", () => {
    const raw = "<|channel>thought\n<channel|>DELTA q=gate value=true evidence=\"a\"\n[3]<channel|>FACT importance=2 text=\"b\" evidence=\"c\"";
    expect(stripReasoningBlocks(raw)).toBe("DELTA q=gate value=true evidence=\"a\"\n[3]<channel|>FACT importance=2 text=\"b\" evidence=\"c\"");
  });

  it("strips a harmony analysis block and leaves the final channel for the channel parser", () => {
    expect(stripReasoningBlocks("<|channel|>analysis<|message|>a<|end|><|start|>assistant<|channel|>final<|message|>b<|return|>")).toBe("<|start|>assistant<|channel|>final<|message|>b<|return|>");
  });

  it("strips reasoning before a JSON answer", () => {
    expect(JSON.parse(stripReasoningBlocks("<think>Use {\"ops\": [1]} maybe?</think>\n{\"ops\": []}"))).toEqual({ ops: [] });
  });

  it("is idempotent", () => {
    const once = stripReasoningBlocks("<think>a </think> b</think>\nAnswer");
    expect(stripReasoningBlocks(once)).toBe(once);
    expect(once).toBe("Answer");
  });
});

describe("T0 finding 7: a stated name loses the sentence's full stop, a sentence keeps its own", () => {
  const story = { qualityByKey: {
    party_name: { key: "party_name", type: "string", source: "extractor", rubric: "Party name?" },
    last_words: { key: "last_words", type: "string", source: "extractor", rubric: "What did he say?" },
    mood: { key: "mood", type: "enum", values: ["calm.", "calm"], source: "extractor", rubric: "Mood?" },
  } } as unknown as Parameters<typeof parseSharedReadResponse>[1];
  const value = (line: string) => parseSharedReadResponse(line, story).deltas[0]?.delta.v;

  it("trims a trailing period from a short stated name", () => {
    expect(value('DELTA party_name value="Ash Lanterns." evidence="Write us down as the Ash Lanterns."')).toBe("Ash Lanterns");
    expect(value('DELTA party_name value="Ash Lanterns" evidence="x"')).toBe("Ash Lanterns");
  });

  it("leaves a value with its own sentences, an ellipsis, a question and an enum alone", () => {
    expect(value('DELTA last_words value="Run. Now." evidence="x"')).toBe("Run. Now.");
    expect(value('DELTA last_words value="Wait..." evidence="x"')).toBe("Wait...");
    expect(value('DELTA last_words value="Who goes there?" evidence="x"')).toBe("Who goes there?");
    expect(value('DELTA mood value="calm." evidence="x"')).toBe("calm.");
  });
});

describe("a value written twice in the bare form (v2.8 31 F5, seen on the local model)", () => {
  const story = { qualityByKey: { clues: { key: "clues", type: "int" as const, source: "extractor" as const, monotonic: true, rubric: "How many clues?" } } };

  it("reads `clues=3 value=3` as the one value it states", () => {
    const parsed = parseSharedReadResponse('DELTA clues=3 value=3 evidence="The ledger lies open on the desk."', story);
    expect(parsed.deltas.map((entry) => entry.delta.v)).toEqual([3]);
    expect(parsed.rejected).toEqual([]);
  });

  it("control: two different values stay refused, and a quoted number stays a string (A36)", () => {
    expect(parseSharedReadResponse('DELTA clues=2 value=3 evidence="x"', story).rejected.map((entry) => entry.reason)).toEqual(["invalid value"]);
    expect(parseSharedReadResponse('DELTA clues="3" evidence="x"', story).rejected.map((entry) => entry.reason)).toEqual(["invalid value"]);
  });
});
