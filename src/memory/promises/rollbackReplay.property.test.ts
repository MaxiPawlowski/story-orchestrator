import { applyPromiseLines, type PromiseApplyContext, type PromiseWindowMessage } from "./impl";
import { createPromises, openRows, rollbackPromises } from "./state";
import type { ParsedPromiseLine, PromisesState } from "./types";

const SEEDS = [1, 7, 42, 99, 1234, 31337];
const MESSAGES = 60;
const READ = 4;
const CAST = [{ id: "mara", names: ["Mara"] }, { id: "kael", names: ["Kael"] }];
const OBJECTS = ["lantern", "ledger", "brother", "blade", "map", "ring", "horse", "letter"];

const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

interface Step {
  message: PromiseWindowMessage;
  line?: (state: PromisesState) => ParsedPromiseLine | null;
}

const chat = (seed: number): Step[] => {
  const next = rng(seed);
  return Array.from({ length: MESSAGES }, (_, messageId): Step => {
    const roll = next(), pick = next(), who = next() < 0.5 ? CAST[0] : CAST[1];
    const object = OBJECTS[Math.floor(next() * OBJECTS.length)];
    if (messageId % 2 === 0) {
      const text = `${who.names[0]} hands over the ${object}. "You owe me nothing more," ${who.names[0]} says. "You did it."`;
      const kind = roll < 0.2 ? "released" : roll < 0.4 ? "kept" : null;
      return {
        message: { messageId, speaker: who.names[0], text, isUser: false },
        line: kind ? (state) => {
          const open = openRows(state).filter((row) => row.promisee === who.id);
          const row = open[Math.floor(pick * open.length)];
          return row ? { kind, target: row.id, messageId, quote: kind === "released" ? "You owe me nothing more," : "You did it.", line: `[${kind}] ${row.id}` } : null;
        } : undefined,
      };
    }
    const text = roll < 0.55 ? `${who.names[0]}, I promise I'll bring the ${object}.` : roll < 0.7 ? `${who.names[0]}, I'm sorry, I can't bring the ${object}.` : `Maybe I'll look for the ${object}.`;
    return {
      message: { messageId, speaker: "Rin", text, isUser: true },
      line: (state) => {
        if (roll < 0.55) return { kind: "promised", target: who.names[0], messageId, quote: text, line: `[promised] ${who.names[0]} m=${messageId}` };
        const open = openRows(state).filter((row) => row.promisee === who.id);
        const row = open[Math.floor(pick * open.length)];
        if (roll < 0.7 && row) return { kind: "broken", target: row.id, messageId, quote: "I can't bring", line: `[broken] ${row.id}` };
        return roll >= 0.7 ? { kind: "promised", target: who.names[0], messageId, quote: text, line: `[promised] hedge m=${messageId}` } : null;
      },
    };
  });
};

const run = (steps: Step[], below = Infinity): PromisesState => {
  let state = createPromises();
  for (let from = 0; from < steps.length; from += READ) {
    const batch = steps.slice(from, from + READ).filter((step) => step.message.messageId < below);
    if (!batch.length) break;
    const messages = steps.slice(Math.max(0, from - 2), from + READ).filter((step) => step.message.messageId < below).map((step) => step.message);
    const context: PromiseApplyContext = {
      chatId: "c", window: { from: messages[0].messageId, to: messages[messages.length - 1].messageId, messages }, cast: CAST, boundary: from,
    };
    const lines: ParsedPromiseLine[] = [];
    for (const step of batch) {
      const made = step.line?.(applyPromiseLines(state, lines, context, ["Rin"]).state);
      if (made) lines.push(made);
    }
    state = applyPromiseLines(state, lines, context, ["Rin"]).state;
  }
  return state;
};

const claims = (state: PromisesState): unknown => JSON.parse(JSON.stringify(state, (key, value) => (key === "inputRange" ? undefined : value)));

describe("plan 47 P3: promise rollback equals replay", () => {
  it.each(SEEDS)("seed %i: rolling back to any message equals stopping there", (seed) => {
    const steps = chat(seed);
    const full = run(steps);
    expect(full.rows.length).toBeGreaterThan(3);
    expect(full.rows.some((row) => row.events.length)).toBe(true);
    for (let cut = 0; cut <= MESSAGES; cut += 1) {
      expect(claims(rollbackPromises(full, cut))).toEqual(claims(run(steps, cut)));
    }
  });

  it("reopens a closed promise when the closure is rolled back, and keeps the row (P2r)", () => {
    const full = run(chat(42));
    const closed = full.rows.find((row) => row.events.length);
    expect(closed).toBeDefined();
    const back = rollbackPromises(full, closed!.events[0].source.messageId);
    expect(back.rows.find((row) => row.id === closed!.id)?.events).toEqual([]);
  });
});
