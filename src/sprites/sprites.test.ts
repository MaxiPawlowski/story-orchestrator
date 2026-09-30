import { segmentText } from "./segment";
import { keywordSet, placeSet, readSpriteProfile, readSpriteSets, resolveSprite, spriteIndex } from "./profile";
import {
  buildExpressionRequest, classifyExpressions, expressionGrammar, localLabel, parseExpressionLines, readExpressionAnswers, NARRATION, type ExpressionInput,
} from "./classify";
import { defaultSpriteSettings, sanitizeSpriteSettings } from "./settings";
import { spriteActivation, spritesActive, storyDirectsStage, storySpriteChoice, userSpriteChoice } from "./activation";
import { directionKeys, figureBox, frameSlice, isSpotlit, memberDirection, readStageDirection } from "./direction";
import type { JudgeAnswer } from "@judge/types";

const REPLY = "Belle laughs and slams her tankard down. \"Ha! You call that a punch?\"\n\nThen her face falls. \"He didn't make it back, did he?\" She stares at the fire.";

describe("sprite segmenter", () => {
  it("splits paragraphs and keeps offsets into the original text", () => {
    const segments = segmentText(REPLY, 400, true);
    expect(segments).toHaveLength(2);
    for (const segment of segments) expect(REPLY.slice(segment.start, segment.end)).toBe(segment.text);
    expect(segments[1].text.startsWith("Then her face falls.")).toBe(true);
  });

  it("packs sentences up to the budget and never cuts one", () => {
    const text = "One short line. Two short line. Three short line. Four short line.";
    const segments = segmentText(text, 34, true);
    expect(segments.map((segment) => segment.text)).toEqual(["One short line. Two short line.", "Three short line. Four short line."]);
  });

  it("while streaming, emits only closed segments, and the prefix never re-segments", () => {
    const half = REPLY.slice(0, REPLY.indexOf("Then her face") + 12);
    const streaming = segmentText(half, 400, false);
    expect(streaming.map((segment) => segment.text)).toEqual([segmentText(REPLY, 400, true)[0].text]);
    expect(segmentText("An unfinished thought with no end", 400, false)).toEqual([]);
    expect(segmentText("An unfinished thought with no end", 400, true)).toHaveLength(1);
  });
});

const PROFILE = readSpriteProfile({
  folder: "Belle",
  default: "neutral",
  labels: {
    neutral: { what: "calm", fallback: [] },
    happy: { what: "glad", fallback: ["neutral"] },
    laughing: { what: "laughs", fallback: ["happy", "neutral"] },
    sad: { what: "sorrow", fallback: ["neutral"] },
    rage: { what: "battle fury", fallback: ["angry", "neutral"] },
    angry: { what: "angry", fallback: ["neutral"] },
    "bad-label": { what: "dash is refused" },
  },
  local_map: { joy: "happy", sadness: "sad", amusement: "laughing" },
}, "Belle.png");

describe("sprite profile", () => {
  it("reads the card block and refuses labels ST would truncate", () => {
    expect(PROFILE?.folder).toBe("Belle");
    expect(Object.keys(PROFILE?.labels ?? {})).not.toContain("bad-label");
    expect(readSpriteProfile({ labels: {} }, "x")).toBeNull();
    expect(readSpriteProfile(null, "x")).toBeNull();
  });

  it("walks the fallback chain against the sprites that exist", () => {
    const profile = PROFILE!;
    const files = spriteIndex([{ label: "neutral", path: "/n.png" }, { label: "happy", path: "/h.png" }, { label: "angry", path: "/a.png" }]);
    expect(resolveSprite(profile, "laughing", files)).toEqual({ label: "happy", path: "/h.png" });
    expect(resolveSprite(profile, "rage", files)).toEqual({ label: "angry", path: "/a.png" });
    expect(resolveSprite(profile, "unknown", files)).toEqual({ label: "neutral", path: "/n.png" });
    expect(resolveSprite(profile, "sad", spriteIndex([]))).toBeNull();
  });
});

const input = (cast: string[]): ExpressionInput => ({
  speaker: "Belle",
  cast,
  labels: PROFILE!.labels,
  localMap: PROFILE!.localMap,
  fallbackLabel: "neutral",
  segments: segmentText(REPLY, 400, true).map((segment, index) => ({ index: index + 1, text: segment.text })),
});

const choice = (value: string): JudgeAnswer => ({ type: "choice", choice: value, confidence: 0.9, probabilities: {} } as unknown as JudgeAnswer);

describe("expression classifier", () => {
  it("asks who only when more than the speaker is on stage", () => {
    expect(Object.keys(buildExpressionRequest(input(["Belle"])).questions)).toEqual(["face:1", "face:2"]);
    const group = buildExpressionRequest(input(["Belle", "Kira"]));
    expect(Object.keys(group.questions)).toEqual(["who:1", "face:1", "who:2", "face:2"]);
    expect(Object.keys((group.questions["who:1"] as { criteria: object }).criteria)).toEqual(["Belle", "Kira", NARRATION]);
  });

  it("reads the judge's answers, clamping an unknown face to the fallback", () => {
    const answers = { "who:1": choice("Kira"), "face:1": choice("laughing"), "who:2": choice("Belle"), "face:2": choice("nonsense") };
    expect(readExpressionAnswers(answers, input(["Belle", "Kira"])).map(({ who, face }) => [who, face])).toEqual([["Kira", "laughing"], ["Belle", "neutral"]]);
  });

  it("parses the grammar-bound LLM lines and refuses a partial answer", () => {
    const grammar = expressionGrammar(input(["Belle", "Kira"]));
    expect(grammar).toContain("\"narration\"");
    expect(grammar).toContain("\"rage\"");
    expect(parseExpressionLines("1|Belle|laughing\n2|belle|sad\n", input(["Belle", "Kira"]))?.map((read) => read.face)).toEqual(["laughing", "sad"]);
    expect(parseExpressionLines("1|Belle|laughing\n", input(["Belle", "Kira"]))).toBeNull();
  });

  it("maps local scores through the authored map", () => {
    expect(localLabel([{ label: "sadness", score: 0.4 }, { label: "amusement", score: 0.6 }], input(["Belle"]))).toBe("laughing");
    expect(localLabel([{ label: "curiosity", score: 1 }], input(["Belle"]))).toBe("neutral");
  });

  it("falls through judge -> llm -> local -> speaker", async () => {
    const warned: string[] = [];
    const warn = (step: string) => warned.push(step);
    const failing = async () => { throw new Error("down"); };
    const viaLlm = await classifyExpressions(input(["Belle"]), { judge: failing, llm: async () => "1|Belle|laughing\n2|Belle|sad\n", local: failing, warn });
    expect(viaLlm.map((read) => read.source)).toEqual(["llm", "llm"]);
    const viaLocal = await classifyExpressions(input(["Belle"]), { judge: async () => null, llm: async () => "garbage", local: async () => [{ label: "joy", score: 1 }], warn });
    expect(viaLocal.map((read) => [read.source, read.face])).toEqual([["local", "happy"], ["local", "happy"]]);
    const none = await classifyExpressions(input(["Belle"]), { judge: null, llm: null, local: failing, warn });
    expect(none.map((read) => [read.source, read.face])).toEqual([["speaker", "neutral"], ["speaker", "neutral"]]);
    expect(warned).toEqual(["judge", "local"]);
    const viaJudge = await classifyExpressions(input(["Belle"]), { judge: async () => ({ "face:1": choice("laughing"), "face:2": choice("sad") }), llm: failing, local: failing, warn });
    expect(viaJudge.map((read) => [read.source, read.face])).toEqual([["judge", "laughing"], ["judge", "sad"]]);
  });
});

describe("sprite settings", () => {
  it("clamps numbers and keeps known modes", () => {
    expect(sanitizeSpriteSettings({ stage: "sideways", segmentChars: 5, crossfadeMs: 300 })).toMatchObject({ stage: "vn", segmentChars: 400, crossfadeMs: 300 });
  });

  const directed = { checkpoints: [{ effects: {} }, { effects: { stage: { spotlight: "Belle" } } }] };
  const undirected = { checkpoints: [{ effects: { stage: { framing: "sideways" } } }, {}] };

  it("W11 U1: the install switch is off by default, and an unset or unmarked enabled is not a user choice", () => {
    expect(defaultSpriteSettings()).toMatchObject({ enabled: false, explicit: false });
    expect(sanitizeSpriteSettings({ enabled: true })).toMatchObject({ enabled: false, explicit: false });
    expect(sanitizeSpriteSettings({ enabled: false, explicit: true })).toMatchObject({ enabled: false, explicit: true });
    expect(sanitizeSpriteSettings({ explicit: true })).toMatchObject({ explicit: false });
  });

  it("W11 U1: a story that directs a stage turns sprites on for its chats unless the user switched them off", () => {
    expect(storyDirectsStage(directed)).toBe(true);
    expect(storyDirectsStage(undirected)).toBe(false);
    expect(storyDirectsStage(null)).toBe(false);
    const unset = defaultSpriteSettings();
    expect(spriteActivation(unset, true)).toBe("story");
    expect(spriteActivation(unset, false)).toBe("off");
    expect(spriteActivation(userSpriteChoice(false), true)).toBe("user-off");
    expect(spriteActivation(userSpriteChoice(true), false)).toBe("user-on");
    expect(spriteActivation(storySpriteChoice(), true)).toBe("story");
    expect(["story", "user-on"].map((activation) => spritesActive(activation as never))).toEqual([true, true]);
    expect(["off", "user-off"].map((activation) => spritesActive(activation as never))).toEqual([false, false]);
  });
});

describe("sprite sets", () => {
  const sets = readSpriteSets({
    sets: [
      { id: "tavern", when: { places: ["victorys_game"], keywords: ["tankard", "ale"] } },
      { id: "ball", when: { checkpoints: ["acad-mid-year-ball"], places: ["aegis_academy"] } },
      { id: "Bad-Id", when: {} },
    ],
  });

  it("always offers the default and refuses ids ST would truncate", () => {
    expect(sets.map((entry) => entry.id)).toEqual(["default", "tavern", "ball"]);
  });

  it("prefers the checkpoint, then the place, then the default", () => {
    expect(placeSet(sets, { location: "aegis_academy", checkpoint: "acad-mid-year-ball" })).toBe("ball");
    expect(placeSet(sets, { location: "Victorys_Game", checkpoint: "adv-guild" })).toBe("tavern");
    expect(placeSet(sets, { location: null, checkpoint: null })).toBe("default");
  });

  it("switches on whole words in the reply only", () => {
    expect(keywordSet(sets, "She raises her tankard.")).toBe("tavern");
    expect(keywordSet(sets, "Her ale-soaked grin.")).toBe("tavern");
    expect(keywordSet(sets, "The alert guard sings a tale.")).toBeNull();
  });
});

describe("stage direction", () => {
  it("reads framing, spotlight and per-member sets and faces by lowercased name", () => {
    const direction = readStageDirection({ framing: "thigh", spotlight: "Natalia", cast: { Natalia: { set: "ball_gown", face: "determined" }, Leevon: { hidden: true }, Bad: { set: "Ball-Gown" } } });
    expect(direction).toEqual({ framing: "thigh", spotlight: "natalia", cast: { natalia: { set: "ball_gown", face: "determined" }, leevon: { hidden: true } } });
    expect(memberDirection(direction, directionKeys("NATALIA"))).toEqual({ set: "ball_gown", face: "determined" });
    expect(memberDirection(direction, directionKeys("Ronan", ["leevon"]))).toEqual({ hidden: true });
    expect(isSpotlit(direction, directionKeys("Natalia"))).toBe(true);
  });

  it("ignores empty or unknown directions", () => {
    expect(readStageDirection(undefined)).toBeNull();
    expect(readStageDirection({ framing: "wide", cast: { Belle: {} } })).toBeNull();
    expect(memberDirection(null, ["belle"])).toEqual({});
  });

  it("frames a slice of the figure from its top", () => {
    const box = { top: 0.1, bottom: 0.9 };
    expect(frameSlice("full", box)).toEqual({ scale: 1, offset: 0 });
    expect(frameSlice("thigh", null)).toEqual({ scale: 1, offset: 0 });
    const thigh = frameSlice("thigh", box);
    expect(thigh.scale).toBeCloseTo(1 / (0.8 * 0.6 + 0.04));
    expect(thigh.offset).toBeCloseTo(0.06 * thigh.scale);
    expect(frameSlice("close", box).scale).toBeGreaterThan(thigh.scale);
  });

  it("finds the figure's vertical extent from alpha", () => {
    const width = 2;
    const height = 4;
    const pixels = new Array(width * height * 4).fill(0);
    pixels[(1 * width + 1) * 4 + 3] = 255;
    pixels[(2 * width + 0) * 4 + 3] = 255;
    expect(figureBox(pixels, width, height)).toEqual({ top: 0.25, bottom: 0.75 });
    expect(figureBox(new Array(16).fill(0), 2, 2)).toBeNull();
  });
});
