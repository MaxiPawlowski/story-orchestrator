import { applyEpistemicSignals, rollbackEpistemic } from "./epistemic";
import {
  BEAT_RING_CAP, castVoices, INTENT_LAPSE_BOUNDARIES, INTENT_LAPSE_K_PROVISIONAL, intentLapsed, rollbackBeats, MEDIAN_BOUNDARIES_PER_SCENE,
} from "./innerVoice";
import * as kRecipe from "../../test/measurements/v2.6-06/k-intent-lapse.json";
import {
  admitIntents, capIntents, checkpointCast, intentEvidence, isMetaCommentary, beatAnchorId, freshBeat, harvestReasoning, HARVEST_HEADER, NARRATOR_HEADER, NARRATOR_SUBJECT_CAP,
  narratorScope, pushBeat, renderNarratorBlock, renderOwnAims,
} from "./innerRender";
import { estimateTokens } from "./budget";
import { NARRATOR_HOLDINGS_TOKEN_BUDGET, NARRATOR_HOLDINGS_WINDOW } from "./stores";
import { parseInnerBeat, renderInnerBeatPrompt } from "./innerBeat";
import { parseEpistemicLine } from "./parse";
import { provenance } from "./provenance";
import type { EpistemicEntry, InnerBeat } from "./types";

const window = [
  { speaker: "Kael", text: "I leave before dawn. Nobody stops me.", isUser: false },
  { speaker: "Max", text: "I watch Lyria pack her bag.", isUser: true },
  { speaker: "DM Narrator", text: "Lyria folds the map twice and hides it in her boot, eyes on the door.", isUser: false },
];

const entry = (patch: Partial<EpistemicEntry>): EpistemicEntry => ({
  id: "e1", subject: "Kael", tag: "intends", content: "leave before dawn", createdAt: 2, messageId: 2,
  provenance: provenance({ source: "extractor", messageId: 2, boundary: 2, pass: "t" }), ...patch,
});

describe("intends: evidence rule (v2.6 plan 06 B, overview rule 10)", () => {
  const evidence = intentEvidence(window, ["Max"]);

  it("keeps an intent the character states itself, or that narration shows the character doing", () => {
    const kept = admitIntents([
      { tag: "intends", subject: "Kael", content: "leave before dawn" },
      { tag: "intends", subject: "Lyria", content: "keep the map from everyone" },
    ], evidence);
    expect(kept.map((signal) => signal.subject)).toEqual(["Kael", "Lyria"]);
  });

  it("drops a player-attributed intent, whether the persona is named or the line is the player's own", () => {
    expect(admitIntents([{ tag: "intends", subject: "Max", content: "follow Lyria" }], evidence)).toEqual([]);
    expect(admitIntents([{ tag: "intends", subject: "Max", content: "follow Lyria" }], intentEvidence(window, []))).toEqual([]);
    const narrated = intentEvidence([{ speaker: "DM Narrator", text: "Max reaches for the map, clearly meaning to take it.", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Max", content: "take the map" }], narrated)).toEqual([]);
  });

  it("drops an intent only the player's narration shows, and meta-commentary", () => {
    const onlyPlayer = intentEvidence([{ speaker: "Max", text: "Bren clearly wants the throne.", isUser: true }, { speaker: "Kael", text: "Hm.", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Bren", content: "take the throne" }], onlyPlayer)).toEqual([]);
    expect(admitIntents([{ tag: "intends", subject: "Kael", content: "I should write a tense reply for the user" }], evidence)).toEqual([]);
  });

  it("AS-1: drops an intent the subject never supported, though the subject spoke", () => {
    const greeted = intentEvidence([{ speaker: "Haley", text: "Good morning.", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Haley", content: "murder the baron" }], greeted)).toEqual([]);
    const unrelated = intentEvidence([{ speaker: "Haley", text: "The weather turned cold on the pass.", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Haley", content: "steal the crown" }], unrelated)).toEqual([]);
  });

  it("AS-1: drops an intent only the player's narration supports, though the subject spoke", () => {
    const narrated = intentEvidence([
      { speaker: "Max", text: "Haley sharpens her knife, meaning to murder the baron.", isUser: true },
      { speaker: "Haley", text: "Good morning.", isUser: false },
    ], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Haley", content: "murder the baron" }], narrated)).toEqual([]);
  });

  it("AS-1: drops an intent another character only mentions, in speech or in reported speech", () => {
    const spoken = intentEvidence([{ speaker: "Kael", text: "\"Haley means to steal the crown,\" he whispers.", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Haley", content: "steal the crown" }], spoken)).toEqual([]);
    const reported = intentEvidence([{ speaker: "Kael", text: "Kael swears Haley wants the crown for herself.", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Haley", content: "steal the crown" }], reported)).toEqual([]);
    const claimed = intentEvidence([{ speaker: "DM Narrator", text: "Haley clearly wants the crown.", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Haley", content: "steal the crown" }], claimed)).toEqual([]);
  });

  it("AS-1: keeps an intent the subject's own words or own shown action support", () => {
    const said = intentEvidence([{ speaker: "Haley", text: "\"Tonight I take the crown.\"", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Haley", content: "steal the crown" }], said)).toHaveLength(1);
    const shown = intentEvidence([{ speaker: "DM Narrator", text: "The hall empties. Haley slips toward the crown, gloves on.", isUser: false }], ["Max"]);
    expect(admitIntents([{ tag: "intends", subject: "Haley", content: "steal the crown" }], shown)).toHaveLength(1);
  });

  it("never filters the other tags, and refuses every intent without evidence", () => {
    expect(admitIntents([{ tag: "knows", subject: "Max", content: "the map" }], null)).toHaveLength(1);
    expect(admitIntents([{ tag: "intends", subject: "Kael", content: "leave before dawn" }], null)).toEqual([]);
  });

  it("parses [intends] on the same line grammar as the other tags", () => {
    expect(parseEpistemicLine("[intends] Kael | leave before dawn")).toEqual({ tag: "intends", subject: "Kael", content: "leave before dawn" });
  });

  it("names meta-commentary without catching plain story text", () => {
    expect(isMetaCommentary("The user wants a longer answer")).toBe(true);
    expect(isMetaCommentary("I will describe the room in this reply")).toBe(true);
    expect(isMetaCommentary("slip past the guard before the bells")).toBe(false);
  });
});

describe("intends: lifecycle", () => {
  it("K is three times the median boundaries per scene", () => {
    expect(INTENT_LAPSE_BOUNDARIES).toBe(3 * MEDIAN_BOUNDARIES_PER_SCENE);
  });

  it("K and its recipe agree: the value, and whether D1 has set it yet", () => {
    expect(kRecipe.constants.MEDIAN_BOUNDARIES_PER_SCENE).toBe(MEDIAN_BOUNDARIES_PER_SCENE);
    expect(kRecipe.constants.INTENT_LAPSE_BOUNDARIES).toBe(INTENT_LAPSE_BOUNDARIES);
    expect(kRecipe.provisional).toBe(INTENT_LAPSE_K_PROVISIONAL);
    if (INTENT_LAPSE_K_PROVISIONAL) expect(INTENT_LAPSE_BOUNDARIES).toBe(24);
    else expect(kRecipe).toHaveProperty("measured.corpus");
  });

  it("lapses on three scene breaks after the last affirmation, or K boundaries, whichever comes first; never pinned", () => {
    const scenes = (...ids: number[]) => ids.map((messageId) => ({ kind: "scene_summary", messageId }));
    expect(intentLapsed(entry({}), { boundary: 3, derived: scenes(3, 4) })).toBe(false);
    expect(intentLapsed(entry({}), { boundary: 3, derived: scenes(1, 3, 4, 5) })).toBe(true);
    expect(intentLapsed(entry({}), { boundary: 2 + INTENT_LAPSE_BOUNDARIES, derived: [] })).toBe(true);
    expect(intentLapsed(entry({ affirmedAt: [{ messageId: 4, boundary: 4 }] }), { boundary: 5, derived: scenes(3, 5, 6) })).toBe(false);
    expect(intentLapsed(entry({ pinned: true }), { boundary: 999, derived: scenes(3, 4, 5) })).toBe(false);
    expect(intentLapsed(entry({ tag: "knows" }), { boundary: 999, derived: scenes(3, 4, 5) })).toBe(false);
  });

  it("a restated intent is affirmed in place, and a rollback past the restatement takes the affirmation back", () => {
    const first = applyEpistemicSignals([], [{ tag: "intends", subject: "Kael", content: "leave before dawn" }], { boundary: 2, messageId: 2 });
    const again = applyEpistemicSignals(first.entries, [{ tag: "intends", subject: "Kael", content: "leave before dawn" }], { boundary: 5, messageId: 6 });
    expect(again.entries).toHaveLength(1);
    expect(again.entries[0].affirmedAt).toEqual([{ messageId: 6, boundary: 5 }]);
    expect(rollbackEpistemic(again.entries, 6)[0].affirmedAt).toBeUndefined();
    expect(rollbackEpistemic(again.entries, 7)[0].affirmedAt).toEqual([{ messageId: 6, boundary: 5 }]);
  });

  it("caps open intents per member at three, newest kept, pinned and retired rows exempt", () => {
    const rows = ["a", "b", "c", "d"].map((id, index) => entry({ id, content: id, createdAt: index }));
    expect(capIntents(rows).map((row) => row.id)).toEqual(["b", "c", "d"]);
    expect(capIntents([{ ...rows[0], pinned: true }, ...rows.slice(1), entry({ id: "e" })]).map((row) => row.id)).toEqual(["a", "c", "d", "e"]);
    expect(capIntents([entry({ id: "k", tag: "knows" }), ...rows]).map((row) => row.id)).toEqual(["k", "b", "c", "d"]);
  });
});

describe("authored aims and the narrator view", () => {
  const story = {
    roster: [{ id: "kael", name: "Kael", drive: "clear his brother's name" }, { id: "lyria", name: "Lyria" }, { id: "dm", name: "DM", view: "omniscient" }],
    checkpointById: { cp: { motives: { lyria: "keep the map hidden" } } },
  };

  it("reads drive, the active checkpoint's motive and the narrator view", () => {
    expect(castVoices(story, "cp")).toEqual([
      { id: "kael", name: "Kael", drive: "clear his brother's name" },
      { id: "lyria", name: "Lyria", motive: "keep the map hidden" },
      { id: "dm", name: "DM", omniscient: true },
    ]);
    expect(castVoices(story, null)[1]).toEqual({ id: "lyria", name: "Lyria" });
  });

  it("renders own aims in the second person; nothing when nothing is authored", () => {
    expect(renderOwnAims({ id: "kael", name: "Kael", drive: "x", motive: "y", beat: "z" }).split("\n").slice(1)).toEqual(["- What you want: x", "- Right now: y", "- Your intent this turn: z"]);
    expect(renderOwnAims(undefined)).toBe("");
  });

  it("the narrator block unions the others' hiding/intends/knows rows, capped per subject, and never its own", () => {
    const rows = [
      entry({ id: "h", subject: "Kael", tag: "hiding", hiddenFrom: "Lyria", content: "the theft" }),
      entry({ id: "s", subject: "Kael", tag: "suspects", content: "a traitor" }),
      entry({ id: "n", subject: "DM", tag: "knows", content: "the ending" }),
      ...Array.from({ length: 8 }, (_, index) => entry({ id: `k${index}`, subject: "Lyria", tag: "knows", content: `fact ${index}` })),
    ];
    const text = renderNarratorBlock(rows, castVoices(story, "cp"), "dm");
    expect(text.startsWith(NARRATOR_HEADER)).toBe(true);
    expect(text).toContain("- Kael is concealing from Lyria: the theft");
    expect(text).not.toContain("a traitor");
    expect(text).not.toContain("the ending");
    expect(text.split("\n").filter((line) => line.startsWith("- Lyria"))).toHaveLength(NARRATOR_SUBJECT_CAP);
  });
});

describe("the narrator's holdings, scoped to the scene (v2.7 41 P3)", () => {
  const roster = [
    { id: "kael", name: "Kael Varro", drive: "clear his brother's name" },
    { id: "lyria", name: "Lyria", drive: "keep the map" },
    { id: "oren", name: "Oren Dask", drive: "sell the map twice", aliases: ["the Fence"] },
    { id: "tam", name: "Tam", drive: "find his sister" },
    { id: "absent", name: "Absent One", drive: "stay forgotten" },
    { id: "dm", name: "DM", view: "omniscient" as const },
  ];
  const story = {
    roster,
    checkpointById: { cp: { motives: { lyria: "hide the map" }, talk_control: { speakers: [{ member: "Kael Varro" }], lead: "dm" } } },
  };
  const row = (name: string, mes: string, extra: Record<string, unknown> = {}) => ({ name, mes, ...extra });
  const render = (rows: unknown[], enabled: string[] = [], budget?: number) => {
    const scope = narratorScope(story, "cp", enabled, rows, NARRATOR_HOLDINGS_WINDOW, budget);
    return renderNarratorBlock([], castVoices(story, "cp"), "dm", scope);
  };
  const subjects = (text: string) => text.split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2).split(/ wants:|, right now:/)[0])
    .filter((name, index, list) => list.indexOf(name) === index);

  it("the window and budget are the named constants", () => {
    expect(NARRATOR_HOLDINGS_WINDOW).toBe(20);
    expect(NARRATOR_HOLDINGS_TOKEN_BUDGET).toBe(1000);
  });

  it("the checkpoint's cast is the enabled members, the motive holders and the talk speakers, resolved by id or card name", () => {
    expect(checkpointCast(story, "cp", ["tam"])).toEqual(["tam", "lyria", "kael", "dm"]);
    expect(checkpointCast(story, null, ["tam"])).toEqual(["tam"]);
  });

  it("keeps the checkpoint's cast with nothing said, and drops a member who is neither in it nor named", () => {
    expect(subjects(render([]))).toEqual(["Kael Varro", "Lyria"]);
    const text = render([row("Max", "I look around.", { is_user: true })], ["tam"]);
    expect(subjects(text)).toEqual(["Kael Varro", "Lyria", "Tam"]);
    expect(text).not.toContain("Oren Dask");
    expect(text).not.toContain("stay forgotten");
  });

  it("adds a member named in the recent messages, by full name, unique given name or alias, newest first", () => {
    expect(subjects(render([row("Max", "Where is Oren Dask?", { is_user: true })]))).toEqual(["Oren Dask", "Kael Varro", "Lyria"]);
    expect(subjects(render([row("Max", "Oren's stall is shut.", { is_user: true })]))).toContain("Oren Dask");
    expect(subjects(render([row("Max", "I ask the fence about it.", { is_user: true }), row("DM", "Tam waves.")]))).toEqual(["Tam", "Oren Dask", "Kael Varro", "Lyria"]);
    expect(subjects(render([row("DM", "Tam waves."), row("Max", "Ask THE FENCE.", { is_user: true })]))).toEqual(["Oren Dask", "Tam", "Kael Varro", "Lyria"]);
    expect(subjects(render([row("DM", "Lyria nods at Kael Varro.")]))).toEqual(["Kael Varro", "Lyria"]);
  });

  it("a name outside the window or in a hidden message does not count, and a lower-case word is not a given name", () => {
    const old = [row("DM", "Oren Dask leaves."), ...Array.from({ length: NARRATOR_HOLDINGS_WINDOW }, () => row("DM", "Rain."))];
    expect(render(old)).not.toContain("Oren Dask");
    expect(render([row("DM", "Oren Dask leaves.", { is_system: true })])).not.toContain("Oren Dask");
    expect(render([row("DM", "An oren tree and a dask of ale.")])).not.toContain("Oren Dask");
  });

  it("members enabled in the group are never dropped, whatever the budget", () => {
    expect(subjects(render([], ["tam", "oren"], 0))).toEqual(["Oren Dask", "Tam"]);
    expect(subjects(render([row("DM", "Lyria waits.")], ["tam"], 0))).toEqual(["Tam"]);
  });

  it("the budget binds only the additions (motive holders, speakers, named off stage): newest first, whole members, the next one tried", () => {
    const rows = [row("DM", "Lyria waits."), row("DM", "Oren Dask grins.")];
    const oren = estimateTokens("- Oren Dask wants: sell the map twice");
    const lyria = estimateTokens("- Lyria wants: keep the map\n- Lyria, right now: hide the map");
    const full = render(rows, ["tam"]);
    const text = render(rows, ["tam"], oren + lyria);
    expect(subjects(text)).toEqual(["Oren Dask", "Lyria", "Tam"]);
    expect(text.split("\n").every((line) => full.split("\n").includes(line))).toBe(true);
    expect(subjects(render(rows, ["tam"], oren + lyria - 1))).toEqual(["Oren Dask", "Kael Varro", "Tam"]);
    expect(render(rows, [], 0)).toBe("");
  });

  it("is deterministic: the same chat and state render byte-identical text, ties in roster order", () => {
    const rows = [row("DM", "Tam and Oren Dask argue.")];
    expect(render(rows)).toBe(render(rows));
    expect(subjects(render(rows))).toEqual(["Oren Dask", "Tam", "Kael Varro", "Lyria"]);
  });

  it("without a scope the block is unchanged (every cast member)", () => {
    expect(subjects(renderNarratorBlock([], castVoices(story, "cp"), "dm"))).toEqual(["Kael Varro", "Lyria", "Oren Dask", "Tam", "Absent One"]);
  });
});

describe("the inner beat ring and its prompt", () => {
  const beat = (patch: Partial<InnerBeat>): InnerBeat => ({ chatId: "c", memberId: "kael", basedOnMessageId: 4, checkpointId: "cp", beat: "b", at: "t", ...patch });

  it("anchors on the newest character message before the player's line", () => {
    expect(beatAnchorId([{ is_user: true }, {}, { is_user: true }])).toBe(1);
    expect(beatAnchorId([{ is_user: true }, {}, { is_user: true }, {}])).toBe(1);
    expect(beatAnchorId([{}, { is_system: true }, { is_user: true }])).toBe(0);
    expect(beatAnchorId([{ is_user: true }])).toBe(-1);
  });

  it("is fresh only for the same member, chat, checkpoint and reply", () => {
    const anchor = { chatId: "c", checkpointId: "cp", basedOn: 4 };
    expect(freshBeat([beat({})], "kael", anchor)?.beat).toBe("b");
    expect(freshBeat([beat({ chatId: "other" })], "kael", anchor)).toBeNull();
    expect(freshBeat([beat({ checkpointId: "cp2" })], "kael", anchor)).toBeNull();
    expect(freshBeat([beat({ basedOnMessageId: 3 })], "kael", anchor)).toBeNull();
    expect(freshBeat([beat({})], "lyria", anchor)).toBeNull();
  });

  it("over a player turn: any beat from the turn's base reply to the newest row, the newest base first; nothing before the base or past the chat", () => {
    const turn = { chatId: "c", checkpointId: "cp", basedOn: 4, upTo: 7 };
    expect(freshBeat([beat({ basedOnMessageId: 6, beat: "mid" }), beat({ beat: "base" })], "kael", turn)?.beat).toBe("mid");
    expect(freshBeat([beat({ basedOnMessageId: 3 })], "kael", turn)).toBeNull();
    expect(freshBeat([beat({ basedOnMessageId: 8 })], "kael", turn)).toBeNull();
  });

  it("is a capped ring, replaced per member and reply, and a rollback drops a beat built on a removed reply", () => {
    const ring = Array.from({ length: BEAT_RING_CAP + 2 }, (_, index) => beat({ memberId: `m${index}` })).reduce<InnerBeat[]>((kept, next) => pushBeat(kept, next), []);
    expect(ring).toHaveLength(BEAT_RING_CAP);
    expect(pushBeat([beat({ beat: "old" })], beat({ beat: "new" }))).toEqual([beat({ beat: "new" })]);
    expect(rollbackBeats([beat({ basedOnMessageId: 3 }), beat({ basedOnMessageId: 4 })], 4)).toEqual([beat({ basedOnMessageId: 3 })]);
  });

  it("parses BEAT and TONE strictly, and refuses meta-commentary or an over-long beat", () => {
    expect(parseInnerBeat("BEAT: Stall them at the door.\nTONE: Wary and cold")).toEqual({ beat: "Stall them at the door.", tone: "wary" });
    expect(parseInnerBeat("She waits.")).toBeNull();
    expect(parseInnerBeat("BEAT: I should write a reply for the user")).toBeNull();
    expect(parseInnerBeat(`BEAT: ${"x".repeat(300)}`)).toBeNull();
  });

  it("the prompt carries the private rows, agency and steering, and forbids deciding for the player", () => {
    const prompt = renderInnerBeatPrompt({ storyTitle: "S", memberName: "Kael", checkpointName: "C", objective: "O", agency: "- rule", steering: "slow down", privateRows: "- What you want: x", window: [{ speaker: "Kael", text: "hi" }] });
    expect(prompt).toContain("- What you want: x");
    expect(prompt).toContain("Pacing: slow down");
    expect(prompt).toContain("Never decide what the player does");
    expect(prompt.trim().endsWith("TONE: <one word>")).toBe(true);
  });
});

describe("B2 reasoning harvest (switch off by default)", () => {
  it("takes each character's own reasoning in the window, minus meta-commentary, and never the player's", () => {
    const rows = [
      { name: "Kael", extra: { reasoning: "He fears the guard. I should write something tense for the user." } },
      { name: "Max", is_user: true, extra: { reasoning: "player thoughts" } },
      { name: "Lyria", extra: { reasoning: "She wants the map gone." } },
      { name: "Lyria", extra: { reasoning: "outside the window" } },
    ];
    expect(harvestReasoning(rows, { from: 0, to: 2 })).toBe(`${HARVEST_HEADER}\nKael: He fears the guard.\nLyria: She wants the map gone.`);
  });
});
