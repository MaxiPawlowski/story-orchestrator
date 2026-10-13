import { PLAYER_TURNS_KEY, StoryEngine, parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { GUIDANCE_PREAMBLE, OPEN_STRETCH_LINE, encounterOfferLine, pullLine } from "@pacing/index";
import type { PromptHost } from "../hostPorts";
import type { TensionRuntimeState } from "../types";
import { playerTurnValues } from "../stretchTurns";
import { PacingCoordinator } from "./pacingCoordinator";

type Row = { is_user: boolean; mes: string };

const KEY = INJECTION_REGISTRY.checkpointGuidance.key;
const ARRIVE = { all: [{ q: "reached_walls", op: "==", v: true }, { q: "lamp_lit", op: "==", v: true }] };

const raw = (stretch: Record<string, unknown>) => ({
  format: 2,
  id: "offer-road",
  title: "Offer road",
  description: "An open road between two places.",
  qualities: [
    { key: PLAYER_TURNS_KEY, type: "int", source: "code", rubric: "player turns here" },
    { key: "lamp_lit", type: "bool", source: "code", rubric: "the party lit the lamp" },
    { key: "reached_walls", type: "bool", source: "extractor", rubric: "the party reached the walls" },
  ],
  checkpoints: [
    { id: "road", name: "On the road", objective: "Reach the walls.", type: "intermediate", start: true, stretch },
    { id: "walls", name: "The walls", objective: "Arrive.", type: "anchor" },
  ],
  transitions: [{ from: "road", to: "walls", priority: 1, gate: ARRIVE }],
  roster: [] as never[],
});

const OFFER = { mode: "open", pace: "brief", offer: ["encounters"], arrive_when: ARRIVE };
const OFFERS = [
  { title: "A broken cart", situation: "A merchant's cart lies tipped at the roadside." },
  { title: "Smoke on the ridge", situation: "A thin column of smoke rises from the ridge." },
  { title: "The toll keeper", situation: "A bored toll keeper has set a rope across the road." },
];
const LAMP = "I light the lamp.";

class Play {
  readonly chat: Row[] = [];
  readonly engine: StoryEngine;

  constructor(readonly story: NormalizedStoryV2) {
    this.engine = new StoryEngine({
      now: () => 0,
      derive: (view) => [
        ...playerTurnValues(story, view, this.chat),
        { q: "lamp_lit", v: this.chat.slice(0, view.lastMessageId + 1).some((row) => row.is_user && /lamp/.test(row.mes)) },
      ],
    });
    this.engine.loadStory(story);
  }

  send(replies: number, mes = "I walk on.") {
    this.chat.push({ is_user: true, mes });
    for (let reply = 0; reply < replies; reply += 1) {
      this.chat.push({ is_user: false, mes: "A reply." });
      this.engine.commitBoundary({ lastMessageId: this.chat.length - 1, chatLength: this.chat.length });
    }
  }

  swipeLast() {
    const last = this.chat.length - 1;
    const boundary = this.engine.boundaryBeforeMessage(last);
    if (boundary !== null) this.engine.rollbackTo(boundary);
    this.engine.commitBoundary({ lastMessageId: last, chatLength: this.chat.length });
  }

  remove(id: number) {
    this.chat.splice(id, 1);
    const boundary = this.engine.boundaryBeforeMessage(id);
    if (boundary !== null) this.engine.rollbackTo(boundary);
    this.engine.clampToChat(this.chat.length);
    this.chat.forEach((row, at) => { if (!row.is_user && at > this.engine.serialize().lastMessageId) this.engine.commitBoundary({ lastMessageId: at, chatLength: this.chat.length }); });
  }

  block(offers: typeof OFFERS = OFFERS, engine: StoryEngine = this.engine): string {
    const blocks = new Map<string, string>();
    const prompt = {
      setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
      clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
    } as unknown as PromptHost;
    let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
    new PacingCoordinator({
      getStory: () => this.story,
      getState: () => engine.serialize(),
      getStateLog: () => engine.stateLog,
      getEncounters: () => offers,
      getTensionTarget: () => undefined,
      getTension: () => tension,
      setTension: (next) => { tension = next; },
      getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: false }),
      hosts: { prompt, chat: { chatRows: () => this.chat } },
    }).updateSteering();
    return blocks.get(KEY) ?? "";
  }
}

const story = parseStoryV2OrThrow(raw(OFFER));
const WITHOUT = parseStoryV2OrThrow(raw({ mode: "open", pace: "brief", arrive_when: ARRIVE }));
const play = (loaded = story, ...turns: Array<[number, string?]>) => {
  const run = new Play(loaded);
  turns.forEach(([replies, mes]) => run.send(replies, mes));
  return run;
};

describe("v2.8 19: encounters are offered when the stretch goes quiet, and only then", () => {
  it("before pull_after player turns the narrator gets the open-stretch line alone, whatever the pool holds", () => {
    const block = play(story, [3], [3]).block();
    expect(block).toBe([GUIDANCE_PREAMBLE, OPEN_STRETCH_LINE].join("\n"));
    OFFERS.forEach((offer) => expect(block).not.toContain(offer.title));
  });

  it("at pull_after, with nothing a gate names moved, the menu follows the pull inside the private guidance block", () => {
    const block = play(story, [3], [3], [3]).block();
    expect(block).toBe([GUIDANCE_PREAMBLE, pullLine("gentle", "The walls"), encounterOfferLine(OFFERS)].join("\n"));
    OFFERS.forEach((offer) => expect(block).toContain(`- ${offer.title}: ${offer.situation}`));
    expect(block).toContain("None is required");
    expect(block).toContain("never name a title");
    expect(block).not.toContain("Objective:");
    expect(block.startsWith(GUIDANCE_PREAMBLE)).toBe(true);
  });

  it("a watched quality that moved in the last three player turns holds the menu back and keeps the pull", () => {
    const block = play(story, [2], [2, LAMP], [2]).block();
    expect(block).toContain(pullLine("gentle", "The walls"));
    expect(block).not.toContain("A broken cart");
  });

  it("an empty or unusable pool offers nothing, and the block is the stretch's own", () => {
    const block = play(story, [1], [1], [1]).block([]);
    expect(block).toBe([GUIDANCE_PREAMBLE, pullLine("gentle", "The walls")].join("\n"));
  });

  it("a stretch that does not offer encounters never shows a menu, quiet or not", () => {
    expect(play(WITHOUT, [1], [1], [1]).block()).toBe([GUIDANCE_PREAMBLE, pullLine("gentle", "The walls")].join("\n"));
  });

  it("a swipe of the last reply keeps the menu; deleting a player line takes it away and a replay agrees", () => {
    const run = play(story, [2], [2], [2]);
    const before = run.block();
    expect(before).toContain("A broken cart");
    run.swipeLast();
    expect(run.block()).toBe(before);
    run.remove(0);
    expect(run.block()).not.toContain("A broken cart");
    const again = new Play(story);
    again.chat.push(...run.chat);
    again.chat.forEach((row, at) => { if (!row.is_user) again.engine.commitBoundary({ lastMessageId: at, chatLength: again.chat.length }); });
    expect(again.block()).toBe(run.block());
  });

  it("a reopened chat shows the same menu as the continuous run", () => {
    const continuous = play(story, [2], [2, LAMP], [2], [2], [2]);
    const reopened = play(story, [2], [2, LAMP], [2]);
    const fresh = new Play(story);
    fresh.chat.push(...reopened.chat);
    fresh.engine.hydrate(reopened.engine.serialize(), reopened.engine.serializeHistory());
    [fresh].forEach((run) => { run.send(2); run.send(2); });
    expect(fresh.block()).toBe(continuous.block());
    expect(continuous.block()).toContain("A broken cart");
  });

  it("the offer line asks for at most one, never resolves it for the player and carries the agency words", () => {
    const line = encounterOfferLine(OFFERS);
    expect(line).toContain("At most once");
    expect(line).toContain("never resolve it for {{user}}");
    expect(line).toContain("may ignore it");
    expect(encounterOfferLine([])).toBe("");
  });
});
