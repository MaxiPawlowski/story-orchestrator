jest.mock("@services/STAPI", () => ({
  showChoicePopup: jest.fn(),
  showTextPopup: jest.fn(),
  registerHostMacro: jest.fn(),
  unregisterHostMacro: jest.fn(),
  getContext: () => ({ chat: [] }),
}));
jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

import { StoryEngine, type ApplyQueueEntry, type BoundaryLogEntry, type PrimitiveValue } from "@engine/index";
import { OATH, spanFor, type ChatRow } from "../../test/support/recapFixtures";
import { cardSections, currentSection, deriveRefs } from "./consequences";
import { appendRefs, rollbackRecap, type RecapRuntimeState } from "./recapPort";
import { runRollback, type RollbackDeps } from "./rollback";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "./runToken";
import type { RuntimeExtras } from "./types";

interface Turn { q: string; v: PrimitiveValue; player?: boolean; code?: boolean }

const TURNS: Turn[] = [
  { q: "trust_score", v: 2 }, { q: "oath_state", v: "sworn", player: true }, { q: "trust_score", v: 6 }, { q: "rank_level", v: 2, code: true },
  { q: "banner_raised", v: true, player: true }, { q: "storm_broke", v: true }, { q: "oath_state", v: "broken" }, { q: "trust_score", v: 1 },
];

const lineFor = (index: number) => `Turn ${index}: I swear and raise the banner.`;

const chatOf = (turns: number): ChatRow[] => Array.from({ length: turns * 2 + 1 }, (_, message) => (message % 2
  ? { is_user: true, mes: lineFor((message - 1) / 2), name: "You" }
  : { is_user: false, mes: `Reply ${message}.`, name: "Narrator" }));

const entryFor = (turn: Turn, index: number, chat: ChatRow[]): ApplyQueueEntry => {
  const player = 2 * index + 1;
  const span = turn.player ? { playerSpan: spanFor(chat, player) } : {};
  return turn.code
    ? { source: "mechanical", blackboardVersionSum: 0, deltas: [{ q: turn.q, v: turn.v }] }
    : { source: "extractor", blackboardVersionSum: 0, turnRange: { from: player, to: player + 1 }, deltas: [{ q: turn.q, v: turn.v, source: "extractor", ...span }] };
};

const play = (turns: readonly Turn[]) => {
  const chat = chatOf(turns.length);
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(OATH);
  let recap: RecapRuntimeState | undefined;
  const step = (turn: Turn, index: number) => {
    engine.enqueue(entryFor(turn, index, chat));
    engine.commitBoundary({ lastMessageId: 2 * index + 2, chatLength: 2 * index + 3 });
    recap = appendRefs(recap, deriveRefs(OATH, engine.stateLog.at(-1) as BoundaryLogEntry));
  };
  turns.forEach(step);
  return { engine, chat, step, recap: () => recap, setRecap: (next: RecapRuntimeState | undefined) => { recap = next; } };
};

const surfaces = (run: ReturnType<typeof play>) => {
  const view = { story: OATH, state: run.engine.serialize(), recap: run.recap(), chat: run.chat };
  return { refs: run.recap()?.refs ?? [], current: currentSection(view), cards: cardSections(view) };
};

const seeded = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
};

describe("v2.8 46 C4: the recap after a rollback equals the recap of the replayed chat", () => {
  it("property over random histories, edit points and replacement turns, chapter crossings included", () => {
    const random = seeded(4646);
    let crossings = 0;
    for (let trial = 0; trial < 80; trial += 1) {
      const history = Array.from({ length: 3 + Math.floor(random() * 5) }, () => TURNS[Math.floor(random() * TURNS.length)]);
      const run = play(history);
      const edited = Math.floor(random() * history.length);
      const message = 2 * edited + 1;
      if (run.engine.shouldRollbackFromMessage(message)) {
        const boundary = run.engine.boundaryBeforeMessage(message);
        expect(boundary).not.toBeNull();
        expect(run.engine.rollbackTo(boundary as number).ok).toBe(true);
      }
      run.setRecap(rollbackRecap(run.recap(), run.engine.serialize().boundary));
      const kept = run.engine.serialize().boundary;
      const replacement = Array.from({ length: history.length - kept }, () => TURNS[Math.floor(random() * TURNS.length)]);
      replacement.forEach((turn, offset) => run.step(turn, kept + offset));
      const fresh = play([...history.slice(0, kept), ...replacement]);
      expect(surfaces(run)).toEqual(surfaces(fresh));
      if (Object.keys(surfaces(fresh).cards).length) crossings += 1;
    }
    expect(crossings).toBeGreaterThan(5);
  });

  it("code-only boundary: the recap keeps exactly what the engine keeps (the SC1 detectors decide)", () => {
    const run = play([{ q: "oath_state", v: "sworn", player: true }, { q: "rank_level", v: 2, code: true }]);
    expect(run.recap()?.refs.map((ref) => `${ref.id}@${ref.boundary}`)).toEqual(["sworn@1", "veteran@2"]);
    const engineMoves = run.engine.shouldRollbackFromMessage(3);
    if (engineMoves) run.engine.rollbackTo(run.engine.boundaryBeforeMessage(3) as number);
    const after = rollbackRecap(run.recap(), run.engine.serialize().boundary);
    expect(after?.refs.map((ref) => ref.boundary).every((boundary) => boundary <= run.engine.serialize().boundary)).toBe(true);
    expect(after?.refs.length).toBe(engineMoves ? 1 : 2);
    const milestoneEarned = run.engine.serialize().blackboard.values.rank_level === 2;
    expect(after?.refs.some((ref) => ref.id === "veteran")).toBe(milestoneEarned);
  });
});

describe("v2.8 46 rollback wiring: runRollback drops the refs of every boundary the engine undid", () => {
  const harness = () => {
    const run = play([{ q: "oath_state", v: "sworn", player: true }, { q: "banner_raised", v: true, player: true }, { q: "storm_broke", v: true }]);
    const context: RunContext = { chatId: "chat-a", storyId: "s", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null };
    const ownership: RunOwnership = { mint: (window = null) => mintToken(context, window), check: (token) => tokenMatches(context, token) };
    const extras = { memory: { chapters: [] }, extraction: { audits: [] }, judge: { calls: [] }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] }, recap: run.recap() };
    const deps = {
      engine: run.engine, ownership,
      journal: { record: () => undefined, getRecords: () => [] },
      context: () => ({ lastMessageId: 6, chatLength: 7, journal: { boundary: 3, messageId: 6 } }),
      memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
      stagecraft: { revertAppliedSince: async () => undefined },
      pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
      revalidateExpansion: () => undefined, restoreExpansion: () => 0,
      extras: () => extras as unknown as RuntimeExtras,
      refreshRequirements: () => undefined,
      reapplyCheckpoint: async () => undefined,
      persist: async () => undefined,
      notify: () => undefined,
      notices: { lastRollback: null, rollbackUnavailable: null },
      setStatus: () => undefined,
      onApplied: () => undefined,
    } as unknown as RollbackDeps;
    return { run, extras, deps };
  };

  it("a swipe of the banner turn drops that turn's refs and everything after", async () => {
    const h = harness();
    expect(h.extras.recap?.refs.map((ref) => ref.boundary)).toEqual([1, 2, 3, 3]);
    const outcome = await runRollback(h.deps, 3, undefined, "swipe", 1);
    expect(outcome).toMatchObject({ ok: true, result: "applied" });
    expect(h.extras.recap?.refs.map((ref) => `${ref.kind}:${ref.id}`)).toEqual(["milestone:sworn"]);
  });

  it("control: a mutation the engine does not act on keeps every ref", async () => {
    const h = harness();
    const before = h.extras.recap;
    const outcome = await runRollback(h.deps, 9, undefined, "edit", 1);
    expect(outcome).toMatchObject({ ok: true, result: "noop" });
    expect(h.extras.recap).toBe(before);
  });
});
