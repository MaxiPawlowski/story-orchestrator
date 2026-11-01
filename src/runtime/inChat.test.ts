import { parseStoryOrThrow, StoryEngine, CLOCK_READ_KEY, type BoundaryLogEntry, type NormalizedStory, type PrimitiveValue } from "@engine/index";
import { deriveLife } from "@engine/life/derive";
import type { SharedReadAudit } from "@extraction/index";
import { chatFor, playBoundaries, POSTING } from "../../test/support/recapFixtures";
import { composeInChat, inChatBecause, inChatSlice, type InChatSources } from "./inChat";
import { defaultChatElements, defaultPresenceSettings } from "./displayToggles";
import { defaultInlineSettings, type InlineLevel } from "./settingsModel";
import { messageRevision } from "./yourMove";
import { EMPTY_IN_CHAT } from "./inChatTypes";

const is = (key: string) => ({ q: key, op: "==", v: true });
const bool = (key: string) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key}.` });

const STORY = parseStoryOrThrow({
  title: "In-chat lab", description: "Slots under the replies.",
  roster: [{ id: "mara", name: "Mara" }],
  clock: { times: ["morning", "afternoon", "evening", "night"], start_part: "morning" },
  qualities: [bool("met_keeper"), bool("door_open"), bool("has_key")],
  codex: {
    people: [{ id: "keeper", name: "The keeper", known_when: is("met_keeper"), facts: [{ id: "keys", text: "Keeps the gate keys.", known_when: is("met_keeper") }] }],
  },
  checkpoints: [
    {
      id: "start", name: "The Gate", player_name: "The Gate", type: "anchor", start: true, objective: "o",
      offers: [
        { id: "ask", text: "I ask the keeper about the gate." },
        { id: "unlock", text: "I unlock the gate.", needs: { when: is("has_key"), reason: "You need the key first." } },
      ],
    },
    { id: "yard", name: "The Yard", player_name: "The Yard", type: "anchor", objective: "o" },
  ],
  transitions: [{ from: "start", to: "yard", priority: 0, gate: { all: [is("door_open"), is("has_key")] } }],
});

type Row = { is_user: boolean; mes: string; name: string; swipe_id?: number };

const played = (story: NormalizedStory = STORY) => {
  const chat: Row[] = [{ is_user: false, mes: "The keeper waits.", name: "Mara" }];
  const engine = new StoryEngine({ now: () => 0, derive: (view) => deriveLife(story, view, chat) });
  engine.loadStory(story);
  const turn = (deltas: Record<string, PrimitiveValue>) => {
    chat.push({ is_user: true, mes: "I step closer.", name: "You" }, { is_user: false, mes: "She looks up.", name: "Mara" });
    const reads = Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const }));
    if (reads.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: reads, turnRange: { from: chat.length - 2, to: chat.length - 1 } });
    engine.commitBoundary({ lastMessageId: chat.length - 1, chatLength: chat.length });
  };
  return { engine, chat, turn };
};

const sources = (run: ReturnType<typeof played>, extra: Partial<InChatSources> = {}, level: InlineLevel = 1, authorView = false): InChatSources => ({
  story: STORY, state: run.engine.serialize(), boundaryLog: run.engine.stateLog as BoundaryLogEntry[], chat: run.chat, castNames: {}, level,
  ui: { authorView, inChat: defaultChatElements(), inline: defaultInlineSettings(), presence: defaultPresenceSettings(), yourMove: true },
  audits: [], recap: [], decisions: [], ...extra,
});

const audit = (at: number): SharedReadAudit => ({ id: `a${at}`, sceneBreak: { at, reason: "location" } } as unknown as SharedReadAudit);

describe("in-chat elements (v3.0 44): one view composed from the snapshot sources", () => {
  it("puts a time divider above the reply where the clock moved and marks a scene break", () => {
    const run = played();
    run.turn({ [CLOCK_READ_KEY]: "evening" });
    run.turn({});
    const view = composeInChat(sources(run, { audits: [audit(3), audit(0), audit(99)] }));
    expect(view.dividers[2]).toEqual({ time: "Day 1, afternoon", scene: false });
    expect(view.dividers[3]).toEqual({ time: null, scene: true });
    expect(Object.keys(view.dividers)).toEqual(["2", "3"]);
  });

  it("shows a journal card where a codex entry latched, with the facts learned there, only while it is known", () => {
    const run = played();
    run.turn({});
    run.turn({ met_keeper: true });
    const view = composeInChat(sources(run));
    expect(Object.keys(view.discovery)).toEqual(["4"]);
    expect(view.discovery[4]).toEqual([{ key: "people:keeper:2", page: "people", name: "The keeper", first: true, facts: ["Keeps the gate keys."] }]);
    const hidden = composeInChat(sources(run, { state: { ...run.engine.serialize(), blackboard: { ...run.engine.serialize().blackboard, values: {} } } }));
    expect(hidden.discovery).toEqual({});
  });

  it("chat-end chips: offers naming no unknown entity and Your move under the last reply, nothing after the player's line or while generating", () => {
    const run = played();
    run.turn({});
    expect(composeInChat(sources(run)).chips?.offers).toEqual([]);
    run.turn({ met_keeper: true });
    const lastId = run.chat.length - 1;
    const decisions = [{ checkpointId: "start", kind: "player", messageId: lastId, source: "rotation", revision: messageRevision(run.chat[lastId]) }] as unknown as InChatSources["decisions"];
    const view = composeInChat(sources(run, { decisions }));
    expect(view.chips).toEqual({ messageId: lastId, yours: true, offers: [{ key: "ask", text: "I ask the keeper about the gate." }], ideas: true });
    expect(composeInChat(sources(run, { generating: true })).chips).toBeNull();
    expect(composeInChat(sources(run, { chat: [...run.chat, { is_user: true, mes: "hi", name: "You" }] })).chips).toBeNull();
    expect(composeInChat(sources(run, { resting: (text) => text.replace(/keeper/, "") })).chips?.offers).toEqual([]);
  });

  it("the gate meter is author-only: Author view at level 3 or more, never in player view", () => {
    const run = played();
    run.turn({ door_open: true });
    run.turn({ has_key: true });
    const author = composeInChat(sources(run, {}, 3, true));
    expect(author.author).toBe(true);
    expect(author.meter[2]).toEqual({ moved: null, rows: [{ toName: "The Yard", met: 1, total: 2, ready: false, open: ["has key = true, now unset"] }] });
    expect(author.meter[4].moved).toBe("The Yard");
    const player = composeInChat(sources(run, {}, 2, false));
    expect(player.author).toBe(false);
    expect(player.meter).toEqual({});
    const { meter: _meter, author: _author, ...playerRest } = player;
    const { meter: _m, author: _a, ...authorRest } = author;
    expect(playerRest).toEqual(authorRest);
  });

  it("level Off and switched-off elements render nothing; the window bounds old messages", () => {
    const run = played();
    run.turn({ [CLOCK_READ_KEY]: "evening", met_keeper: true });
    expect(composeInChat(sources(run, {}, 0))).toBe(EMPTY_IN_CHAT);
    const off = composeInChat(sources(run, { ui: { authorView: true, inChat: { dividers: false, because: false, chips: false, discovery: false, gateMeter: false }, inline: defaultInlineSettings() } }, 4, true));
    expect([off.dividers, off.discovery, off.meter, off.because, off.chips]).toEqual([{}, {}, {}, {}, null]);
    for (let index = 0; index < 30; index += 1) run.turn({});
    const late = composeInChat(sources(run));
    expect(late.dividers).toEqual({});
    expect(late.discovery).toEqual({});
  });

  it("\"Because you…\" shows only a line the recap composer can prove, on the reply where it landed", () => {
    const line = "I take the posting.";
    const chat = chatFor(line);
    const proven = playBoundaries(POSTING, [[[{ q: "posting_choice", v: "taken", player: true }]]], chat);
    const state = proven.engine.serialize();
    const lines = inChatBecause(POSTING, state, proven.refs, chat, () => true);
    expect(lines).toEqual({ 2: ["Because you took the posting, the gatehouse let you in."] });
    const coincidental = playBoundaries(POSTING, [[[{ q: "posting_choice", v: "taken" }]]], chat);
    expect(inChatBecause(POSTING, coincidental.engine.serialize(), coincidental.refs, chat, () => true)).toEqual({});
    expect(inChatBecause(POSTING, state, proven.refs, chat, (id) => id !== 2)).toEqual({});
  });

  it("the snapshot slice caps the level like the notes line: no Author view, no meter, whatever the stored level", () => {
    const run = played();
    run.turn({ door_open: true });
    const extras = (authorView: boolean) => ({
      ui: { authorView, announceTransitions: false, hudEnabled: true, inline: { ...defaultInlineSettings(), level: 4 as const } },
      extraction: { audits: [] }, talk: { decisions: [] }, recap: undefined,
    }) as unknown as Parameters<typeof inChatSlice>[0]["extras"];
    const slice = (authorView: boolean) => inChatSlice({ boundaryLog: run.engine.stateLog as BoundaryLogEntry[], chat: run.chat, extras: extras(authorView) }, STORY, run.engine.serialize(), {});
    expect(slice(false).author).toBe(false);
    expect(slice(false).meter).toEqual({});
    expect(Object.keys(slice(true).meter)).toEqual(["2"]);
  });
});
