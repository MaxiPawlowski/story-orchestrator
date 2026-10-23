import { parseStory, parseStoryOrThrow, type EngineState, type NormalizedStory, type Story } from "@engine/index";
import { usesGameLayer } from "@engine/validate/gameLayer";
import { diffStories } from "@engine/storyDiff";
import { heldSecrets, withoutSecrets, type ArcEntry, type EpistemicEntry } from "@memory/index";
import { playerPromises } from "@memory/promises/state";
import type { PromisesState } from "@memory/promises/types";
import type { PlayedProjection } from "./playerProjection";
import type { PublicPattern } from "./patternsPort";
import {
  ANCHOR_WEIGHTS, anchorCandidates, groundedIn, makeScreen, offerRows, rankAnchors, RESURFACE_BONUS, selectAnchors, stakesLines,
  type AnchorSources, type SuggestionAnchor,
} from "./suggestionAnchors";
import { buildSuggestionPrompt, parseSuggestionLines, ANCHOR_HEADING } from "./suggestions";
import { runDiagnostics } from "../studio/diagnostics";
import { checkToolCall } from "../copilot/agent/tools";
import { applyGameOp, gameOpProblem } from "../copilot/agent/gameOps";

const base = {
  id: "ferry", title: "Ferry", description: "d",
  qualities: [
    { key: "tried_climb", type: "bool", source: "extractor", rubric: "Tried?" },
    { key: "climb_ok", type: "bool", source: "code", rubric: "Rolled" },
    { key: "has_rope", type: "bool", source: "extractor", rubric: "Rope?", display: { public: true, label: "Rope", as: "item" } },
    { key: "friend_near", type: "bool", source: "extractor", rubric: "Friend?" },
    { key: "has_lantern", type: "bool", source: "extractor", rubric: "Lantern?" },
    { key: "met_ferryman", type: "bool", source: "extractor", rubric: "Met?" },
    { key: "found_lodgings", type: "bool", source: "extractor", rubric: "Found?" },
  ],
  roster: [{ id: "ferryman", name: "Ferryman" }],
} as const;

const raw = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...base,
  checkpoints: [
    {
      id: "dock", name: "dock-internal", player_name: "The Dock", objective: "Cross.", player_text: "Find a way across the river.", type: "anchor", start: true,
      offers: [
        { id: "toll", text: "I ask the ferryman what the crossing costs." },
        { id: "below", text: "I light the lantern and go below deck.", needs: { when: { q: "has_lantern", op: "==", v: true }, reason: "You need a lantern first." } },
        { id: "late", text: "I wave to the ferryman.", visible_when: { q: "met_ferryman", op: "==", v: true } },
      ],
    },
    { id: "roof", name: "roof-internal", player_name: "The Rooftops", objective: "Run.", type: "anchor" },
  ],
  transitions: [{
    from: "dock", to: "roof", priority: 0, gate: { all: [{ q: "tried_climb", op: "==", v: true }, { q: "climb_ok", op: "==", v: true }] },
    check: { id: "climb", label: "Climb", quality: "climb_ok", roll: { sides: 20, target: 12 }, narrate: "public",
      modifiers: [{ q: "has_rope", v: true, add: 4, hint: "a rope" }, { q: "friend_near", v: true, add: 2, hint: "a friend's hand" }, { q: "friend_near", v: false, add: -2, hint: "being alone" }] },
  }],
  quests: [{ id: "map", title: "The cartographer's map", visible_when: { q: "met_ferryman", op: "==", v: true },
    steps: [{ text: "Find the cartographer's lodgings", done_when: { q: "found_lodgings", op: "==", v: true } }, { text: "Bring back the map", done_when: { q: "has_rope", op: "==", v: true } }] }],
  ...over,
});

const story = parseStoryOrThrow(raw() as unknown as Story);

const stateOf = (values: Record<string, unknown>, over: Partial<EngineState> = {}): EngineState => ({
  blackboard: { values }, activeCheckpointId: "dock", visitedAnchors: ["dock"], visitedPath: [], boundary: 10, checkpointStartedBoundary: 5, checkpointStartedAt: 0,
  checkpointStartedMessageId: 0, lastMessageId: 9, chatLength: 10, ...over,
}) as unknown as EngineState;

const VALUES = { tried_climb: false, climb_ok: false, has_rope: false, friend_near: false, has_lantern: false, met_ferryman: true, found_lodgings: false };

const projection: PlayedProjection = {
  title: "Ferry", intro: null, player: "Max", visited: ["The Dock"], current: { name: "The Dock", text: "Find a way across the river." },
  sections: [{ id: "quests", label: "Quests", lines: ["The cartographer's map"] }], cast: ["Ferryman"], transcript: [],
};

const arc = (id: string, text: string, openedAt: number, over: Partial<ArcEntry> = {}): ArcEntry => ({ id, text, status: "open", entities: [], openedAt, ...over });

const sources = (over: Partial<AnchorSources> = {}): AnchorSources => ({
  story, state: stateOf(VALUES), projection, arcs: [arc("a1", "Who rang the bell at midnight", 9), arc("a0", "The drowned lighthouse keeper", 0)],
  promises: [], patterns: [], game: null, valuesThen: null, ...over,
});

const open = () => true;

const kinds = (anchors: SuggestionAnchor[]) => anchors.map((entry) => entry.kind);

describe("v2.9 06 slice 1: anchors from what the player already sees", () => {
  it("pins the ranking table", () => {
    expect(ANCHOR_WEIGHTS).toEqual({
      objective: 3, "quest-step": 3, pattern: 3, promise: 2, thread: 2, "check-help": 2, offer: 2, quest: 1.5, "dormant-thread": 1, "clue-action": 1,
    });
    expect(RESURFACE_BONUS).toBe(1.5);
  });

  it("builds every kind from player-visible state: objective, open quest step, current and dormant threads, check help, available offers", () => {
    const candidates = anchorCandidates(sources(), open);
    expect(candidates.map((entry) => [entry.kind, entry.text])).toEqual([
      ["objective", "Find a way across the river."],
      ["quest-step", "Find the cartographer's lodgings"],
      ["thread", "Who rang the bell at midnight"],
      ["dormant-thread", "The drowned lighthouse keeper"],
      ["check-help", "Climb: a rope, a friend's hand could help"],
      ["offer", "I ask the ferryman what the crossing costs."],
      ["offer", "I wave to the ferryman."],
    ]);
  });

  it("a quest with no open visible step anchors on its title; a hidden quest never anchors", () => {
    const done = anchorCandidates(sources({ state: stateOf({ ...VALUES, found_lodgings: true, has_rope: true }) }), open);
    expect(done.filter((entry) => entry.kind.startsWith("quest"))).toEqual([]);
    const hidden = anchorCandidates(sources({ state: stateOf({ ...VALUES, met_ferryman: false }) }), open);
    expect(kinds(hidden)).not.toContain("quest-step");
  });

  it("resurfaces a dormant thread after a subplot closed within the last four boundaries", () => {
    const dormant = (input: Partial<AnchorSources>) => anchorCandidates(sources(input), open).find((entry) => entry.kind === "dormant-thread")?.weight;
    expect(dormant({})).toBe(1);
    expect(dormant({ arcs: [...sources().arcs, arc("a2", "The stolen oar", 2, { status: "resolved", resolvedAt: 8 })] })).toBe(2.5);
    expect(dormant({ arcs: [...sources().arcs, arc("a2", "The stolen oar", 2, { status: "resolved", resolvedAt: 5 })] })).toBe(1);
    expect(dormant({ valuesThen: VALUES, state: stateOf({ ...VALUES, found_lodgings: true }) })).toBe(2.5);
  });

  it("seeded rotation: the same inputs give the same order, another Other ideas press rotates ties, never Math.random", () => {
    const random = jest.spyOn(Math, "random");
    const candidates = anchorCandidates(sources(), open);
    const seed = { chatId: "c", storyId: "ferry", boundary: 10, again: 0 };
    const first = rankAnchors(candidates, seed).map((entry) => entry.id);
    expect(rankAnchors(candidates, seed).map((entry) => entry.id)).toEqual(first);
    const presses = Array.from({ length: 8 }, (_, again) => rankAnchors(candidates, { ...seed, again }).map((entry) => entry.id).join("|"));
    expect(new Set(presses).size).toBeGreaterThan(1);
    presses.forEach((order) => expect(order.split("|").slice(0, 2).sort()).toEqual(["objective:dock", "quest-step:map.0"]));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it("selects at most three, one per kind except quest steps, at most one dormant thread", () => {
    const many = [
      ...["a", "b"].map((id) => ({ id: `quest-step:${id}`, kind: "quest-step" as const, text: `step ${id}`, weight: 3, evidence: [] })),
      ...["c", "d"].map((id) => ({ id: `dormant-thread:${id}`, kind: "dormant-thread" as const, text: `old ${id}`, weight: 2.5, evidence: [] })),
    ];
    expect(kinds(selectAnchors(many))).toEqual(["quest-step", "quest-step", "dormant-thread"]);
    expect(kinds(selectAnchors(rankAnchors(anchorCandidates(sources(), open), { chatId: "c", storyId: "s", boundary: 1, again: 0 })))).toHaveLength(3);
  });

  it("asks for tagged lines over the numbered anchors and leaves the prompt as before with none", () => {
    const anchors = selectAnchors(rankAnchors(anchorCandidates(sources(), open), { chatId: "c", storyId: "s", boundary: 1, again: 0 }));
    const prompt = buildSuggestionPrompt(projection, anchors);
    expect(prompt).toContain(`${ANCHOR_HEADING}\n[1] ${anchors[0].text}`);
    expect(prompt).toContain("starting with its tag");
    expect(buildSuggestionPrompt(projection)).not.toContain(ANCHOR_HEADING);
  });

  it("maps a tag back to its anchor only when the line shares a content word with it", () => {
    const anchors: SuggestionAnchor[] = [
      { id: "thread:a1", kind: "thread", text: "Who rang the bell at midnight", weight: 2, evidence: [] },
      { id: "quest-step:map.0", kind: "quest-step", text: "Find the cartographer's lodgings", weight: 3, evidence: [] },
    ];
    const text = "- [1] I ask the ferryman who rang that bell.\n- [2] I wait by the water.\n- [3] I sing.\n- I look at the fog.";
    expect(parseSuggestionLines(text, projection, [], { anchors, grounded: groundedIn })).toEqual([
      { text: "I ask the ferryman who rang that bell.", anchorId: "thread:a1" },
      { text: "I wait by the water." },
      { text: "I sing." },
      { text: "I look at the fog." },
    ]);
    expect(groundedIn("I search for the cartographers lodging", anchors[1])).toBe(true);
  });
});

const KEPT = { id: "h", subject: "Ferryman", tag: "hiding", hiddenFrom: "Max", content: "that the ferryman sank the old boat himself", createdAt: 1, messageId: 1 } as unknown as EpistemicEntry;
const resting = (text: string) => withoutSecrets(text, heldSecrets([KEPT], ["Ferryman", "Max"]), null);
const SECRET_LINE = "The ferryman sank the old boat himself.";

describe("v2.9 06: one filter pipeline for every anchor kind (resting held secrets, withheld names, unknown entities)", () => {
  const screen = makeScreen({ story, values: VALUES, enabled: ["ferryman"], resting, unseen: ["The Rooftops"] });

  it("drops a text restating a held secret with no unknown proper noun, from every source", () => {
    expect(screen(SECRET_LINE)).toBe(false);
    expect(screen("I ask the ferryman what the crossing costs.")).toBe(true);
    const secretStory = parseStoryOrThrow(raw({
      quests: [{ id: "map", title: "The cartographer's map", steps: [{ text: SECRET_LINE, done_when: { q: "found_lodgings", op: "==", v: true } }] }],
    }) as unknown as Story);
    const withSecrets = sources({
      story: secretStory, arcs: [arc("a1", SECRET_LINE, 9)],
      promises: [{ id: "p1", promisee: "Ferryman", quote: SECRET_LINE }],
      patterns: [{ patternId: "p", rev: "1", phase: "pending", text: SECRET_LINE, evidence: [], boundary: 3 }],
    });
    expect(anchorCandidates(withSecrets, screen).map((entry) => entry.text).filter((text) => /sank/i.test(text))).toEqual([]);
  });

  it("drops a name the player has not seen and an unknown member, and keeps the rest", () => {
    expect(screen("I climb to the Rooftops.")).toBe(false);
    const hidden = makeScreen({ story, values: VALUES, enabled: [], resting: (text) => text, unseen: [] });
    expect(hidden("I ask the Ferryman.")).toBe(false);
    expect(hidden("I look at the river.")).toBe(true);
  });

  it("the model's lines pass the same screen after the answer", () => {
    const lines = parseSuggestionLines(`- ${SECRET_LINE}\n- I climb to the Rooftops.\n- I wait.\n- I ask about the toll.`, projection, [], { screen });
    expect(lines.map((line) => line.text)).toEqual(["I wait.", "I ask about the toll."]);
  });

  it("a conditional promise is never an anchor; an open plain one is, quote and promisee filtered", () => {
    const row = (id: string, conditional: boolean, quote: string) => ({
      id, promisee: "ferryman", quote, conditional, source: { chatId: "c", messageId: 1, revision: "r", speaker: "Max", start: 0, end: quote.length }, events: [],
    });
    const state = { rows: [row("p1", true, "I will pay you if you wait"), row("p2", false, "I will pay you tomorrow"), row("p3", false, SECRET_LINE)] } as unknown as PromisesState;
    const promises = playerPromises(state, () => "Ferryman");
    const anchors = anchorCandidates(sources({ promises }), screen).filter((entry) => entry.kind === "promise");
    expect(anchors.map((entry) => entry.text)).toEqual(["your promise to Ferryman: \"I will pay you tomorrow\""]);
  });

  it("v2.9 05: only pending pattern rows anchor, at the top weight; completed callbacks never do", () => {
    const patterns: PublicPattern[] = [
      { patternId: "twice", rev: "r1", phase: "pending", text: "Try the bell again", evidence: [{ kind: "check", id: "climb", boundary: 4, index: 0, messageId: 5 }], boundary: 4 },
      { patternId: "done", rev: "r1", phase: "completed", text: "You kept your word", evidence: [], boundary: 9 },
    ];
    const anchors = anchorCandidates(sources({ patterns }), open).filter((entry) => entry.kind === "pattern");
    expect(anchors).toEqual([{ id: "pattern:twice@r1", kind: "pattern", text: "Try the bell again", weight: 3, evidence: ["check climb at boundary 4"] }]);
  });

  it("rollback ≡ replay: nothing is stored, so the same state gives byte-identical anchors", () => {
    const one = JSON.stringify(anchorCandidates(sources(), screen));
    anchorCandidates(sources({ state: stateOf({ ...VALUES, has_lantern: true }) }), screen);
    expect(JSON.stringify(anchorCandidates(sources(), screen))).toBe(one);
  });
});

describe("v2.9 06 slice 2: the stakes preview", () => {
  const faces = [0, 0.3, 0.7, 0.99];

  it("lists the disclosed help of a waiting public check, adding modifiers only, never the dice or target", () => {
    const lines = stakesLines(story, stateOf(VALUES), open);
    expect(lines).toEqual([{ checkId: "climb", label: "Climb", hints: [{ text: "a rope", have: false }, { text: "a friend's hand", have: false }] }]);
    expect(JSON.stringify(lines)).not.toMatch(/12|20|d20|alone/);
  });

  it("is identical across every die face and every truth value of a non-public quality; a public quality says you have it", () => {
    const shown = faces.flatMap(() => [false, true].map((friend) => JSON.stringify(stakesLines(story, stateOf({ ...VALUES, friend_near: friend }), open))));
    expect(new Set(shown).size).toBe(1);
    expect(stakesLines(story, stateOf({ ...VALUES, has_rope: true }), open)[0].hints[0]).toEqual({ text: "a rope", have: true });
  });

  it("is gone once the attempt is made, for a hidden check, and while hint_when does not hold", () => {
    expect(stakesLines(story, stateOf({ ...VALUES, tried_climb: true }), open)).toEqual([]);
    const hidden = parseStoryOrThrow(raw({ transitions: [{ from: "dock", to: "roof", priority: 0, gate: { q: "climb_ok", op: "==", v: true },
      check: { id: "climb", quality: "climb_ok", roll: { sides: 20, target: 12 }, modifiers: [{ q: "has_rope", v: true, add: 4 }] } }] }) as unknown as Story);
    expect(stakesLines(hidden, stateOf(VALUES), open)).toEqual([]);
    const gated = parseStoryOrThrow(raw({ transitions: [{ ...(raw().transitions as Array<Record<string, unknown>>)[0],
      check: { ...((raw().transitions as Array<Record<string, unknown>>)[0].check as Record<string, unknown>), hint_when: { q: "met_ferryman", op: "==", v: false } } }] }) as unknown as Story);
    expect(stakesLines(gated, stateOf(VALUES), open)).toEqual([]);
  });

  it("a checkpoint check with when is pending until it rolls this visit", () => {
    const at = parseStoryOrThrow(raw({
      checkpoints: [{ id: "dock", name: "d", objective: "o", type: "anchor", start: true,
        checks: [{ id: "swim", label: "Swim", quality: "climb_ok", roll: { sides: 20, target: 12 }, narrate: "public", when: { q: "tried_climb", op: "==", v: true },
          modifiers: [{ q: "has_rope", v: true, add: 2, hint: "a rope" }] }] }],
      transitions: [],
    }) as unknown as Story);
    expect(stakesLines(at, stateOf(VALUES), open)).toHaveLength(1);
    expect(stakesLines(at, stateOf({ ...VALUES, check_swim_rolled: 3 }, { checkpointStartedBoundary: 1 }), open)).toEqual([]);
    expect(stakesLines(at, stateOf({ ...VALUES, check_swim_rolled: 1 }, { checkpointStartedBoundary: 2 }), open)).toHaveLength(1);
  });

  it("validation: a hint on a hidden check is refused; hint_when must not read what the check writes", () => {
    const hidden = parseStory(raw({ transitions: [{ ...(raw().transitions as Array<Record<string, unknown>>)[0],
      check: { ...((raw().transitions as Array<Record<string, unknown>>)[0].check as Record<string, unknown>), narrate: "hidden" } }] }));
    expect(Array.isArray(hidden) && hidden.map((error) => error.path)).toEqual(expect.arrayContaining(["transitions.0.check.modifiers.0.hint"]));
    const own = parseStory(raw({ transitions: [{ ...(raw().transitions as Array<Record<string, unknown>>)[0],
      check: { ...((raw().transitions as Array<Record<string, unknown>>)[0].check as Record<string, unknown>), hint_when: { q: "climb_ok", op: "==", v: false } } }] }));
    expect(Array.isArray(own) && own.map((error) => error.message).join("; ")).toContain("hint_when reads 'climb_ok'");
  });
});

describe("v2.9 06 slice 3: authored offers with unavailable reasons", () => {
  it("shows an offer only while its checkpoint is active and visible_when holds; a failing needs greys it with the authored reason", () => {
    const rows = offerRows(story, stateOf(VALUES), open);
    expect(rows.available.map((offer) => offer.id)).toEqual(["toll", "late"]);
    expect(rows.unavailable).toEqual([{ id: "below", text: "I light the lantern and go below deck.", reason: "You need a lantern first." }]);
    expect(offerRows(story, stateOf({ ...VALUES, met_ferryman: false, has_lantern: true }), open).available.map((offer) => offer.id)).toEqual(["toll", "below"]);
    expect(offerRows(story, stateOf(VALUES, { activeCheckpointId: "roof" }), open)).toEqual({ available: [], unavailable: [] });
  });

  it("the same offer before and after its disclosure: held back while it names the unseen scene, shown once reached", () => {
    const naming = parseStoryOrThrow(raw({ checkpoints: [{ ...(raw().checkpoints as Array<Record<string, unknown>>)[0], offers: [{ id: "up", text: "I look up at the Rooftops." }] },
      (raw().checkpoints as Array<Record<string, unknown>>)[1]] }) as unknown as Story);
    const before = makeScreen({ story: naming, values: VALUES, enabled: ["ferryman"], resting: (text) => text, unseen: ["The Rooftops", "Rooftops"] });
    const after = makeScreen({ story: naming, values: VALUES, enabled: ["ferryman"], resting: (text) => text, unseen: [] });
    expect(offerRows(naming, stateOf(VALUES), before).available).toEqual([]);
    expect(offerRows(naming, stateOf(VALUES), after).available.map((offer) => offer.id)).toEqual(["up"]);
    expect(runDiagnostics(raw({ checkpoints: [{ ...(raw().checkpoints as Array<Record<string, unknown>>)[0], offers: [{ id: "up", text: "I look up at the Rooftops." }] },
      (raw().checkpoints as Array<Record<string, unknown>>)[1]] }) as unknown as Story).filter((entry) => entry.code === "offer-names-unknown")).toHaveLength(1);
  });

  it("validation: needs on a check result or roll turn is refused; ids, caps and keys are checked", () => {
    const offers = (list: unknown[]) => raw({ checkpoints: [{ ...(raw().checkpoints as Array<Record<string, unknown>>)[0], offers: list }, (raw().checkpoints as Array<Record<string, unknown>>)[1]] });
    const errors = (list: unknown[]) => {
      const result = parseStory(offers(list));
      return Array.isArray(result) ? result.map((error) => `${error.path}: ${error.message}`) : [];
    };
    expect(errors([{ id: "x", text: "I try again.", needs: { when: { q: "climb_ok", op: "==", v: true }, reason: "Not yet." } }]).join("\n")).toContain("a hidden outcome");
    expect(errors([{ id: "x", text: "a" }, { id: "x", text: "b" }]).join("\n")).toContain("duplicate offer 'x'");
    expect(errors(Array.from({ length: 9 }, (_, index) => ({ id: `o${index}`, text: "t" }))).join("\n")).toContain("at most 8");
    expect(errors([{ id: "x", text: "/send hi" }]).join("\n")).toContain("no slash command");
    expect(errors([{ id: "x", text: "t", visible_when: { q: "nope", op: "==", v: true } }]).join("\n")).toContain("unknown quality 'nope'");
    expect(errors([{ id: "x", text: "I knock.", needs: { when: { q: "has_lantern", op: "==", v: true }, reason: "Find a lantern." } }])).toEqual([]);
  });

  it("the wizard writes offers only through setCheckpointOffers, refusing a needs on a hidden outcome", () => {
    const draft = raw() as unknown as Story;
    const call = checkToolCall({ tool: "setCheckpointOffers", args: { id: "dock", offers: [{ id: "knock", text: "I knock on the cabin door." }] } });
    if (!call.ok || call.op?.kind !== "setCheckpointOffers") throw new Error(JSON.stringify(call));
    expect(gameOpProblem(draft, call.op)).toBeNull();
    expect(applyGameOp(draft, call.op).checkpoints[0].offers).toEqual([{ id: "knock", text: "I knock on the cabin door." }]);
    const hidden = { kind: "setCheckpointOffers" as const, id: "dock", offers: [{ id: "x", text: "I try again.", needs: { when: { q: "climb_ok", op: "==" as const, v: true }, reason: "Not yet." } }] };
    expect(gameOpProblem(draft, hidden)).toContain("a hidden outcome");
    expect(checkToolCall({ tool: "setCheckpointOffers", args: { id: "dock", offers: [{ id: "x" }] } }).ok).toBe(false);
  });

  it("an offers-only story loads the game layer and shows its offer rows", () => {
    const json = { id: "o", title: "O", description: "d", qualities: [], roster: [], transitions: [],
      checkpoints: [{ id: "a", name: "a", objective: "o", type: "anchor", start: true, offers: [{ id: "x", text: "I knock on the door." }] }] };
    expect(usesGameLayer(json)).toBe(true);
    const only = parseStoryOrThrow(json as unknown as Story) as NormalizedStory;
    expect(only.checkpointById.a.offers).toEqual([{ id: "x", text: "I knock on the door." }]);
    expect(offerRows(only, stateOf({}, { activeCheckpointId: "a" }), open).available).toHaveLength(1);
  });

  it("a story update that edits offers is compatible; update, rollback and reopen read only the edited offers", () => {
    const edited = parseStoryOrThrow(raw({ checkpoints: [{ ...(raw().checkpoints as Array<Record<string, unknown>>)[0], offers: [{ id: "toll", text: "I haggle over the toll." }] },
      (raw().checkpoints as Array<Record<string, unknown>>)[1]] }) as unknown as Story);
    const diff = diffStories(story, edited, stateOf(VALUES));
    expect(diff.classification).toBe("compatible");
    const rolledBack = stateOf(VALUES, { boundary: 3 });
    expect(offerRows(edited, rolledBack, open).available.map((offer) => offer.text)).toEqual(["I haggle over the toll."]);
  });
});
