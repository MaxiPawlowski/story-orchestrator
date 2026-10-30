import { parseStoryOrThrow, type EngineState, type NormalizedStory, type NpcReplyEffect, type PrimitiveValue } from "@engine/index";
import { CLOCK_DAY_KEY, CLOCK_STORY_TIME_KEY } from "@engine/schema";
import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { SkipDueEvent } from "@pacing/skipAhead";
import { couldNot } from "@utils/writeResult";
import type { PromptHost } from "./hostPorts";
import type { TensionRuntimeState } from "./types";
import { PacingCoordinator } from "./coordinators/pacingCoordinator";
import { cueForSwipe, recordCuedLine, rewindCuedLines, type CuedLine } from "./npcReplyRewind";
import { SKIP_COPY } from "./skipGate";
import { runSkip, type SkipRunDeps } from "./skipRuntime";
import type { SpeechRequest } from "./speechLedger";

const KEY = INJECTION_REGISTRY.checkpointGuidance.key;
const MARK = "chose to skip ahead";

const raw = (clock: boolean) => ({
  title: "Skip", description: "",
  roster: [{ id: "narrator", name: "Narrator", view: "omniscient" }, { id: "arin", name: "Arin" }],
  ...(clock ? { clock: { times: ["morning", "afternoon", "evening", "night"] } } : {}),
  qualities: [{ key: "left", type: "bool", source: "extractor", rubric: "Left?" }],
  checkpoints: [{ id: "a", name: "A", type: "anchor", start: true, objective: "o" }, { id: "b", name: "B", type: "anchor", objective: "o" }],
  transitions: [{ from: "a", to: "b", priority: 0, gate: { q: "left", op: "==", v: true } }],
});

const STORIES = { clocked: parseStoryOrThrow(raw(true)), plain: parseStoryOrThrow(raw(false)) };

const pacingFor = (story: NormalizedStory) => {
  const blocks = new Map<string, string>();
  const prompt = {
    setStoryExtensionPrompt: (key: string, value: string) => { blocks.set(key, value); },
    clearStoryExtensionPrompt: (key: string) => { blocks.delete(key); },
  } as unknown as PromptHost;
  let tension: TensionRuntimeState = { levels: [], smoothed: null, history: [] };
  const pacing = new PacingCoordinator({
    getStory: () => story, getState: () => ({ activeCheckpointId: "a" } as EngineState), getStateLog: () => [], getTensionTarget: () => undefined,
    getTension: () => tension, setTension: (next) => { tension = next; }, getPacing: () => ({ alpha: 0.5, shapeOverride: null, hintEnabled: false }), hosts: { prompt },
  });
  const drafted = (id = "narrator") => {
    pacing.draftGuidance(id);
    const text = blocks.get(KEY) ?? "";
    pacing.releaseDraftGuidance();
    return text;
  };
  return { pacing, drafted };
};

type Cut = "none" | "swipe" | "swipe-twice" | "delete" | "delete-swipe" | "chat-switch" | "reload" | "reload-swipe" | "send-mid" | "send-after";
const CUTS: Cut[] = ["none", "swipe", "swipe-twice", "delete", "delete-swipe", "chat-switch", "reload", "reload-swipe", "send-mid", "send-after"];

interface World {
  story: NormalizedStory;
  host: ReturnType<typeof pacingFor>;
  chat: string[];
  cued: CuedLine[];
  speech: Array<{ request: SpeechRequest; messageId: number | null }>;
  journal: string[];
  promptDuring: string[];
}

const world = (story: NormalizedStory): World => ({ story, host: pacingFor(story), chat: ["opening", "player", "reply"], cued: [], speech: [], journal: [], promptDuring: [] });

const depsFor = (w: World, cut: Cut, owns = true): SkipRunDeps => ({
  stillOwns: () => owns,
  source: () => ({ messageId: w.chat.length - 1, revision: null }),
  reserve: (request) => { w.speech.push({ request, messageId: null }); return { id: w.speech.length, send: 1, request }; },
  settle: (reservation, messageId) => { if (reservation) w.speech[reservation.id - 1].messageId = messageId; },
  speak: async (reply: NpcReplyEffect) => {
    const release = w.host.pacing.armDirection(reply.member, reply.instruction ?? "");
    try {
      w.promptDuring.push(w.host.drafted("narrator"), w.host.drafted("arin"));
      if (cut === "chat-switch") return couldNot("the chat moved");
      if (cut === "send-mid") return couldNot("the player sent a message");
      w.chat.push("skip reply");
      return { ok: true, direction: reply.instruction };
    } finally { release?.(); }
  },
  rendered: () => w.chat.length - 1,
  recordCue: (line) => { w.cued = recordCuedLine(w.cued, line); },
  journal: (summary) => { w.journal.push(summary); },
  persist: () => undefined,
});

const swipe = (w: World, messageId: number): string => {
  const line = cueForSwipe(w.cued, messageId);
  const release = line ? w.host.pacing.armDirection(line.member, line.text, "draft") : null;
  const text = w.host.drafted("narrator");
  release?.();
  return text;
};

const values = (story: NormalizedStory): Readonly<Record<string, PrimitiveValue>> =>
  Object.freeze<Record<string, PrimitiveValue>>(story.life?.clock ? { [CLOCK_STORY_TIME_KEY]: 1, [CLOCK_DAY_KEY]: 1, left: false } : { left: false });

const play = async (storyKey: keyof typeof STORIES, cut: Cut, due: boolean) => {
  const story = STORIES[storyKey];
  let w = world(story);
  const frozen = values(story);
  const events: SkipDueEvent[] = due ? [{ kind: "echo", due: story.life?.clock ? { part: 2 } : { boundary: 4 }, open: true }] : [];
  const outcome = await runSkip({ story, values: frozen, boundary: 3, events, teller: { rosterId: "narrator", name: "Narrator" }, entry: "a@skip" }, depsFor(w, cut));
  const id = outcome.ok ? outcome.messageId : -1;
  const reArmed: boolean[] = [];
  if (cut === "swipe") reArmed.push(swipe(w, id).includes(MARK));
  if (cut === "swipe-twice") reArmed.push(swipe(w, id).includes(MARK), swipe(w, id).includes(MARK));
  if (cut === "delete" || cut === "delete-swipe") {
    w.cued = rewindCuedLines(w.cued, id, { kind: "delete" });
    w.chat.pop();
    if (cut === "delete-swipe") reArmed.push(swipe(w, w.chat.length - 1).includes(MARK));
  }
  if (cut === "reload" || cut === "reload-swipe") {
    w = { ...w, host: pacingFor(story) };
    if (cut === "reload-swipe") reArmed.push(swipe(w, id).includes(MARK));
  }
  if (cut === "send-after") w.chat.push("player");
  const stale = w.host.drafted("narrator").includes(MARK) || w.host.drafted("arin").includes(MARK);
  return { outcome, w, reArmed, stale, frozen, before: values(story) };
};

describe("v3.0 32 S4: the skip is one narrator reply through the 19 one-shot direction", () => {
  it("reaches only the narrator's draft, records the speech row, the cue and the journal row, and leaves nothing armed", async () => {
    const { outcome, w, stale } = await play("clocked", "none", false);
    expect(outcome.ok).toBe(true);
    expect(w.promptDuring[0]).toContain("Direction for Narrator only, this reply: {{user}} chose to skip ahead until evening.");
    expect(w.promptDuring[1]).not.toContain(MARK);
    expect(w.speech).toEqual([expect.objectContaining({ messageId: 3, request: expect.objectContaining({ origin: "skip", member: "Narrator", generated: true }) })]);
    expect(w.cued).toEqual([{ messageId: 3, member: "Narrator", text: expect.stringContaining(MARK) }]);
    expect(w.journal).toEqual([SKIP_COPY.journal]);
    expect(stale).toBe(false);
  });

  it("a refused or stopped reply settles the reservation empty and records no cue or journal row", async () => {
    for (const cut of ["chat-switch", "send-mid"] as const) {
      const { outcome, w, stale } = await play("plain", cut, false);
      expect(outcome.ok).toBe(false);
      expect(w.speech.map((row) => row.messageId)).toEqual([null]);
      expect(w.cued).toEqual([]);
      expect(w.journal).toEqual([]);
      expect(stale).toBe(false);
    }
  });

  it("a run that lapsed while the reply was written keeps no cue, journal row or speech row", async () => {
    const story = STORIES.clocked;
    const w = world(story);
    const outcome = await runSkip({ story, values: values(story), boundary: 3, events: [], teller: { rosterId: "narrator", name: "Narrator" }, entry: "a@skip" }, depsFor(w, "none", false));
    expect(outcome).toMatchObject({ ok: false, reason: SKIP_COPY.moved });
    expect(w.speech.map((row) => row.messageId)).toEqual([null]);
    expect([w.cued, w.journal]).toEqual([[], []]);
    expect(w.host.drafted("narrator")).not.toContain(MARK);
  });

  it("floor D: 40 cuts leave 0 stale directions, 0 forced transitions and 0 time moves; a swipe re-arms, a delete does not", async () => {
    const rows = [];
    for (const storyKey of ["clocked", "plain"] as const) {
      for (const due of [false, true]) {
        for (const cut of CUTS) rows.push({ cut, ...(await play(storyKey, cut, due)) });
      }
    }
    expect(rows).toHaveLength(40);
    expect(rows.filter((row) => row.stale)).toHaveLength(0);
    expect(rows.filter((row) => JSON.stringify(row.frozen) !== JSON.stringify(row.before))).toHaveLength(0);
    expect(rows.filter((row) => ["swipe", "swipe-twice", "reload-swipe"].includes(row.cut)).every((row) => row.reArmed.length > 0 && row.reArmed.every(Boolean))).toBe(true);
    expect(rows.filter((row) => row.cut === "delete-swipe").every((row) => row.reArmed.every((armed) => !armed))).toBe(true);
    expect(rows.filter((row) => row.w.promptDuring[1]?.includes(MARK))).toHaveLength(0);
  });
});
