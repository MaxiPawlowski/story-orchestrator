import { readWith } from "../../test/support/modelCall";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStoryV2OrThrow, StoryEngine, type NormalizedStoryV2 } from "@engine/index";
import { evidenceSources, type EvidenceMessage } from "./evidence";
import { parseSharedReadResponse } from "./parse";
import { PLAYER_ONLY_EVIDENCE, runSharedRead } from "./sharedRead";
import type { SharedReadWindow } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], extensionSettings: {} }),
}));

interface WindowLine {
  index: number;
  speaker: string;
  isUser: boolean;
  text: string;
}

interface LabelledCase {
  source: string;
  rejectedAs: string;
  line: string;
  quotes: number | null;
  acceptedSince?: string;
  window: WindowLine[];
}

interface LevelCase {
  source: string;
  line: string;
  value: string | boolean;
}

const ROOT = join(__dirname, "../..");
const fixture = JSON.parse(readFileSync(join(ROOT, "test/fixtures/v24-acc-labelled-evidence.json"), "utf-8")) as { labelled: LabelledCase[]; levels: LevelCase[] };
const readStory = (file: string): NormalizedStoryV2 => parseStoryV2OrThrow(JSON.parse(readFileSync(join(ROOT, file), "utf-8")));

const messagesOf = (window: WindowLine[]): EvidenceMessage[] => window.map((line) => ({ messageId: line.index, index: line.index, speaker: line.speaker, isUser: line.isUser, text: line.text }));
const evidenceOf = (line: string): string => line.match(/evidence="([\s\S]*)"\s*$/)?.[1] ?? "";
const labelPrefix = /^(?:\[\d+\]\s*)?(?:[^:]{1,40}:)?\s*/;

const byQuote = (index: number) => fixture.labelled.find((entry) => entry.quotes === index && entry.window.length > 2) as LabelledCase;

describe("v2.4 acceptance D1: a quote that carries the window's own line label", () => {
  const found = fixture.labelled.filter((entry) => entry.quotes !== null);

  it("replays every labelled line the acceptance runs refused", () => {
    expect([found.length, fixture.labelled.length]).toEqual([16, 16]);
    for (const entry of fixture.labelled) expect(evidenceOf(entry.line).replace(labelPrefix, "")).not.toBe(evidenceOf(entry.line));
  });

  it.each(found.map((entry) => [`${entry.source} ${entry.line.slice(0, 70)}`, entry] as const))("finds %s in the line it copied", (_name, entry) => {
    expect(evidenceSources(evidenceOf(entry.line), messagesOf(entry.window))).toEqual([entry.quotes]);
  });

  const j7 = messagesOf(fixture.labelled[0].window);

  it("takes the label with or without its index, and with elision", () => {
    expect(evidenceSources("[12] Max: 'We'll take it,' I tell Ponticius", j7)).toEqual([12]);
    expect(evidenceSources("Max: I tell Ponticius, and I accept the Sun Ruins mission", j7)).toEqual([12]);
    expect(evidenceSources("[24] Luke begs to come with us.", j7)).toEqual([24]);
    expect(evidenceSources("[12] Max: We'll take it … on the spot.", j7)).toEqual([12]);
    expect(evidenceSources("  [24]   Max :  I agree to bring Luke", j7)).toEqual([24]);
  });

  it("control: a label is not evidence on its own, even where the name is a word of its line", () => {
    expect(evidenceSources("[12] Max:", j7)).toEqual([]);
    expect(evidenceSources("Max:", j7)).toEqual([]);
    expect(evidenceSources("[12]", j7)).toEqual([]);
    const luke: EvidenceMessage[] = [{ messageId: 41, index: 41, speaker: "Luke", isUser: false, text: "Luke said, his voice high and excited." }];
    expect(evidenceSources("Luke said", luke)).toEqual([41]);
    expect(evidenceSources("Luke:", luke)).toEqual([]);
    expect(evidenceSources("[41] Luke:", luke)).toEqual([]);
  });

  it("control: a label inside the quote is not the line's label", () => {
    expect(evidenceSources("'We'll take it,' Max: I tell Ponticius", j7)).toEqual([]);
    expect(evidenceSources("'We'll take it,' [12] I tell Ponticius", j7)).toEqual([]);
  });

  it("control: a fabricated quote under a true label is still refused", () => {
    expect(evidenceSources("[12] Max: I refuse the mission and walk away.", j7)).toEqual([]);
    expect(evidenceSources("Max: Luke stays behind in the tavern.", j7)).toEqual([]);
  });

  it("control: a quote stitched across two messages is still refused under either label", () => {
    expect(evidenceSources("[12] Max: on the spot. Luke begs to come with us.", j7)).toEqual([]);
    expect(evidenceSources("[24] Max: on the spot. Luke begs to come with us.", j7)).toEqual([]);
  });

  it("control: a label naming another speaker, or another line, than the one quoted is refused", () => {
    const arin = byQuote(5);
    const messages = messagesOf(arin.window);
    const text = "*He reached up and plucked the parchment from the board, folding it in and in his pocket.*";
    expect(evidenceSources(`[5] Arin: ${text}`, messages)).toEqual([5]);
    expect(evidenceSources(`[5] Max: ${text}`, messages)).toEqual([]);
    expect(evidenceSources(`Max: ${text}`, messages)).toEqual([]);
    expect(evidenceSources(`Ponticius: ${text}`, messages)).toEqual([]);
    expect(evidenceSources(`[4] Arin: ${text}`, messages)).toEqual([]);
    expect(evidenceSources(`[6] ${text}`, messages)).toEqual([]);
  });

  it("control: the player mark belongs to the player's own line only", () => {
    const messages: EvidenceMessage[] = [
      { messageId: 4, index: 4, speaker: "Max", isUser: true, text: "I grab the Sun Idol from the altar." },
      { messageId: 5, index: 5, speaker: "DM Narrator", isUser: false, text: "The Sun Idol comes free; you hold it now." },
    ];
    expect(evidenceSources("[4] Max (player): I grab the Sun Idol", messages)).toEqual([4]);
    expect(evidenceSources("[5] DM Narrator (player): you hold it now", messages)).toEqual([]);
  });

  it("control: the label is the window's own, verbatim", () => {
    expect(evidenceSources("max: I tell Ponticius", j7)).toEqual([]);
    expect(evidenceSources("[12] MAX: I tell Ponticius", j7)).toEqual([]);
    expect(evidenceSources("(12) Max: I tell Ponticius", j7)).toEqual([]);
  });

  it("control: without a known speaker or index nothing is stripped", () => {
    expect(evidenceSources("[12] Max: I tell Ponticius", [{ messageId: 12, isUser: true, text: fixture.labelled[0].window[0].text }])).toEqual([]);
  });
});

describe("v2.4 acceptance D1: the screen takes the labelled quote, and the world rule still binds", () => {
  const sunRuins = readStory("examples/sun-ruins/quest-for-the-sun-ruins.json");
  const window = (lines: WindowLine[]): SharedReadWindow => ({ from: lines[0].index, to: lines[lines.length - 1].index, messages: lines.map((line) => ({ ...line, messageId: line.index })) });
  const read = async (story: NormalizedStoryV2, lines: WindowLine[], reply: string) => {
    const engine = new StoryEngine();
    engine.loadStory(story);
    return runSharedRead({
      story,
      state: engine.serialize(),
      priority: 0,
      reason: "d1",
      window: window(lines),
      scope: story.qualities.filter((quality) => quality.source === "extractor").map((quality) => ({ key: quality.key, quality, hints: [] })),
      ...readWith("p1", { debugResponse: reply }),
    });
  };

  it("accepts J7's mission and Luke lines at the messages they quote", async () => {
    const result = await read(sunRuins, fixture.labelled[0].window, [fixture.labelled[0].line, fixture.labelled[1].line].join("\n"));
    expect(result.audit.rejected).toEqual([]);
    expect(result.audit.acceptedDeltas.map((entry) => [entry.delta.q, entry.delta.v, entry.messageId])).toEqual([["mission_accepted", true, 12], ["luke_decision", "accepted", 24]]);
  });

  it("control: a labelled quote of the player's own line is still refused for a world quality", async () => {
    const worldStory = parseStoryV2OrThrow({
      format: 2,
      id: "d1-world",
      title: "D1 world rule",
      description: "v2.4 acceptance D1",
      qualities: [{ key: "mission_accepted", type: "bool", source: "extractor", rubric: "Did the party accept the mission?", evidence_from: "world" }],
      checkpoints: [
        { id: "board", name: "Board", objective: "Take the job", type: "anchor", start: true },
        { id: "road", name: "Road", objective: "Leave town", type: "anchor" },
      ],
      transitions: [{ from: "board", to: "road", priority: 0, gate: { q: "mission_accepted", op: "==", v: true } }],
      roster: [],
    });
    const result = await read(worldStory, fixture.labelled[0].window, fixture.labelled[0].line.replace("[12] Max:", "[12] Max (player):"));
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.audit.rejected.map((entry) => entry.reason)).toEqual([PLAYER_ONLY_EVIDENCE]);
  });
});

describe("v2.4 acceptance D3: a level or enum value written single-quoted, or as value=", () => {
  const stories = [
    readStory("test/fixtures/extractor17.story.json"),
    readStory("examples/sun-ruins/quest-for-the-sun-ruins.json"),
    readStory("test/journeys/j8-stagecraft.story.json"),
    readStory("test/journeys/j11-expand.story.json"),
  ];
  const story = (line: string): NormalizedStoryV2 => {
    const key = line.match(/^DELTA\s+(?:q=)?([A-Za-z0-9_]+)/)?.[1] ?? "";
    return stories.find((entry) => entry.qualityByKey[key]) as NormalizedStoryV2;
  };
  const parse = (line: string) => parseSharedReadResponse(line, story(line));

  it.each(fixture.levels.map((entry) => [entry.line.slice(0, 80), entry] as const))("parses the real line %s", (_name, entry) => {
    const parsed = parse(entry.line);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.deltas).toHaveLength(1);
    expect(parsed.deltas[0].rawLevel ?? parsed.deltas[0].delta.v).toBe(entry.value);
  });

  it("control: a value outside the levels or the enum is still refused, however it is quoted", () => {
    const lines = [
      "DELTA tension_current='frantic' evidence=\"x\"",
      "DELTA tension_current=value=\"frantic\" evidence=\"x\"",
      "DELTA tension_current='Calm' evidence=\"x\"",
      "DELTA tension_current='calm or stirring' evidence=\"x\"",
      "DELTA luke_decision='maybe' evidence=\"x\"",
      "DELTA luke_decision=value='maybe' evidence=\"x\"",
    ];
    for (const line of lines) expect(parse(line).rejected.map((entry) => entry.reason)).toEqual(["invalid value"]);
  });

  it("control: quote stripping never fuzzes or coerces", () => {
    const lines = [
      "DELTA tension_current='calm evidence=\"x\"",
      "DELTA tension_current=calm' evidence=\"x\"",
      "DELTA tension_current=''calm'' evidence=\"x\"",
      "DELTA tension_current=\"'calm'\" evidence=\"x\"",
      "DELTA reached_tower=\"false\" evidence=\"We shoulder our packs\"",
      "DELTA reached_tower='false' evidence=\"We shoulder our packs\"",
      "DELTA road_drained=value='true' evidence=\"We board the ferry.\"",
    ];
    for (const line of lines) expect([line, parse(line).rejected.map((entry) => entry.reason)]).toEqual([line, ["invalid value"]]);
  });

  it("control: a single-quoted value is held to the bare-word rule", () => {
    expect(parse("DELTA password='open sesame' evidence=\"x\"").deltas[0].delta.v).toBe("open sesame");
    expect(parse("DELTA password=open sesame evidence=\"x\"").deltas[0].delta.v).toBe("open sesame");
    for (const line of ["DELTA password='open; sesame' evidence=\"x\"", "DELTA password=open; sesame evidence=\"x\"", "DELTA password='1234' evidence=\"x\""]) {
      expect([line, parse(line).rejected.map((entry) => entry.reason)]).toEqual([line, ["invalid value"]]);
    }
  });

  it("control: the forms the parser already took keep their values", () => {
    expect(parse("DELTA q=tension_current value=\"calm\" evidence=\"x\"").deltas[0].rawLevel).toBe("calm");
    expect(parse("DELTA tension_current value=stirring evidence=\"x\"").deltas[0].rawLevel).toBe("stirring");
    expect(parse("DELTA luke_decision=\"declined\" evidence=\"x\"").deltas[0].delta.v).toBe("declined");
  });
});
