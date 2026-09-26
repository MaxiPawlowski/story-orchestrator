import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RuntimeManager } from "../../src/runtime/runtimeManager";
import { TurnBridge } from "../../src/runtime/turnBridge";
import { cadenceWindowFrom } from "../../src/extraction/scheduler";
import type { ParsedDelta, ParsedFact, SharedReadAudit } from "../../src/extraction/types";
import { resetSpikeHost, spikeContext, spikeEvents, type SpikeRow } from "./spikeHost";

export const SPIKE_STORY = readFileSync(join(__dirname, "..", "fixtures", "spike-edits.story.json"), "utf8");

const VOCAB = ["go", "halt", "key", "drop", "rain", "fire", "song", "bread", "path", "stone"];
const DELTAS: Record<string, { q: string; v: boolean }> = { go: { q: "go", v: true }, halt: { q: "go", v: false }, key: { q: "key", v: true }, drop: { q: "key", v: false } };
export const STEP_WINDOW = 8;

export const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface SpikeTurn {
  user: string;
  reply: string;
}

const pick = (random: () => number, count: number) => Math.floor(random() * count);

export const randomText = (random: () => number) => Array.from({ length: 1 + pick(random, 3) }, () => VOCAB[pick(random, VOCAB.length)]).join(" ");

export const randomScript = (random: () => number, min = 2, max = 8): SpikeTurn[] =>
  Array.from({ length: min + pick(random, max - min + 1) }, () => ({ user: randomText(random), reply: randomText(random) }));

export const differentText = (random: () => number, from: string) => {
  for (;;) {
    const text = randomText(random);
    if (text !== from) return text;
  }
};

interface ReadJob {
  priority: 0 | 1;
  reason: string;
  window: { from: number; to: number };
}

export class ScriptedReader {
  private queue: ReadJob[] = [];
  private cursor: number | null = null;
  private seq = 0;
  reads = 0;
  readonly reasons: string[] = [];

  constructor(private readonly manager: RuntimeManager) {
    manager.onBoundary((result) => {
      const last = result.context.lastMessageId;
      if (result.fired || result.boundary <= 0 || last < 0) return;
      this.queue.push({ priority: 1, reason: "cadence", window: { from: cadenceWindowFrom(this.cursor, last), to: last } });
      this.cursor = last;
    });
    manager.onRollback((messageId, window) => this.queue.push({ priority: 0, reason: `rollback:${messageId}`, window: { from: window.from, to: window.to } }));
    manager.onEpochChanged(() => {
      this.queue = [];
      this.cursor = null;
    });
  }

  get idle() {
    return this.queue.length === 0;
  }

  async drainOne(): Promise<boolean> {
    if (!this.queue.length) return false;
    const index = this.queue.findIndex((job) => job.priority === 0);
    const [job] = this.queue.splice(index < 0 ? 0 : index, 1);
    await this.read(job.window, job.reason);
    return true;
  }

  async read(window: { from: number; to: number }, reason: string) {
    this.reads += 1;
    this.reasons.push(reason);
    const rows = spikeContext.chat;
    const acceptedDeltas: ParsedDelta[] = [];
    const facts: ParsedFact[] = [];
    for (let id = Math.max(0, window.from); id <= Math.min(window.to, rows.length - 1); id += 1) {
      const row = rows[id];
      for (const word of row.mes.split(" ")) {
        const delta = DELTAS[word];
        if (delta) acceptedDeltas.push({ delta: { q: delta.q, v: delta.v, source: "extractor" }, evidence: word, messageId: id });
      }
      if (!row.is_user) facts.push({ text: `Reply ${id} said ${row.mes}.`, evidence: row.mes, importance: 2, messageId: id });
    }
    this.seq += 1;
    const audit: SharedReadAudit = {
      id: `spike-read-${this.seq}`,
      createdAt: new Date().toISOString(),
      priority: 0,
      reason,
      contractHash: "spike",
      scope: ["go", "key"],
      window: { from: window.from, to: window.to },
      prompt: "",
      rawResponse: "",
      acceptedDeltas,
      rejected: [],
    };
    await this.manager.applyExtractionAudit(audit, facts);
  }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export interface SpikeProjection {
  engine: { active: string; values: Record<string, unknown>; path: string[]; last: number; started: number };
  memory: string[];
}

interface LiveRow { tier?: string; text?: string; messageId?: number; supersededBy?: string; provenance?: { validity?: string } }

export const project = (manager: RuntimeManager): SpikeProjection => {
  const state = manager.getEngineState();
  if (!state) throw new Error("no story loaded");
  const rows = ((manager.getSnapshot().memory as { entries?: LiveRow[] } | undefined)?.entries ?? [])
    .filter((row) => !row.supersededBy && (!row.provenance || row.provenance.validity === "live"))
    .map((row) => `${row.tier}|${row.messageId ?? "-"}|${row.text}`);
  return {
    engine: { active: state.activeCheckpointId, values: { ...state.blackboard.values }, path: [...state.visitedPath], last: state.lastMessageId, started: state.checkpointStartedMessageId },
    memory: [...new Set(rows)].sort(),
  };
};

export class SpikeWorld {
  readonly manager = new RuntimeManager();
  readonly bridge = new TurnBridge(this.manager, this.manager.chatSave);
  readonly reader = new ScriptedReader(this.manager);
  boundaries: Array<{ messageId: number; fired: boolean; text: string }> = [];

  static async open(story = SPIKE_STORY): Promise<SpikeWorld> {
    resetSpikeHost();
    const world = new SpikeWorld();
    world.bridge.start();
    world.manager.onBoundary((result) => world.boundaries.push({ messageId: result.context.lastMessageId, fired: Boolean(result.fired), text: spikeContext.chat[result.context.lastMessageId]?.mes ?? "" }));
    await spikeEvents.emit("CHAT_CHANGED");
    await world.manager.importStory(story);
    await world.settle();
    return world;
  }

  async settle() {
    for (let round = 0; round < 200; round += 1) {
      for (let index = 0; index < 12; index += 1) await tick();
      await this.manager.rollbackSettled();
      if (!(await this.reader.drainOne())) {
        for (let index = 0; index < 12; index += 1) await tick();
        if (this.reader.idle) return;
      }
    }
    throw new Error("the world did not settle");
  }

  async turn(turn: SpikeTurn) {
    const chat = spikeContext.chat;
    chat.push({ name: "Player", is_user: true, mes: turn.user, send_date: `t${chat.length}` });
    await spikeEvents.emit("MESSAGE_SENT", chat.length - 1);
    chat.push({ name: "Guide", is_user: false, mes: turn.reply, send_date: `t${chat.length}`, swipes: [turn.reply], swipe_id: 0 });
    await spikeEvents.emit("MESSAGE_RECEIVED", chat.length - 1, "normal");
    await this.settle();
  }

  async play(turns: SpikeTurn[]) {
    for (const turn of turns) await this.turn(turn);
  }

  async edit(messageId: number, texts: string[], events: string[] = ["MESSAGE_EDITED", "MESSAGE_UPDATED"]) {
    const row: SpikeRow = spikeContext.chat[messageId];
    for (const text of texts) {
      row.mes = text;
      if (row.swipes) row.swipes[row.swipe_id ?? 0] = text;
      for (const name of events) await spikeEvents.emit(name, messageId);
    }
    await this.settle();
  }

  async newSwipe(messageId: number, text: string) {
    const row: SpikeRow = spikeContext.chat[messageId];
    row.swipes = [...(row.swipes ?? [row.mes]), ""];
    row.swipe_id = row.swipes.length - 1;
    row.mes = "";
    await spikeEvents.emit("MESSAGE_SWIPED", messageId);
    await this.settle();
    row.mes = text;
    row.swipes[row.swipe_id] = text;
    await spikeEvents.emit("MESSAGE_RECEIVED", messageId, "swipe");
    await this.settle();
  }

  async swipeTo(messageId: number, swipeId: number) {
    const row: SpikeRow = spikeContext.chat[messageId];
    row.swipe_id = swipeId;
    row.mes = row.swipes?.[swipeId] ?? row.mes;
    await spikeEvents.emit("MESSAGE_SWIPED", messageId);
    await this.settle();
  }

  close() {
    this.bridge.stop();
  }
}

export interface ExactProjection extends SpikeProjection {
  boundary: number;
  versions: Record<string, number>;
  pending: string[];
}

export const projectExact = (manager: RuntimeManager): ExactProjection => {
  const state = manager.getEngineState();
  if (!state) throw new Error("no story loaded");
  return {
    ...project(manager),
    boundary: state.boundary,
    versions: { ...state.blackboard.versions },
    pending: manager.writes.pending().map((write) => `${write.turnRange ? `${write.turnRange.from}-${write.turnRange.to}` : "-"}:${write.deltas.map((delta) => `${delta.q}=${JSON.stringify(delta.v)}`).join(",")}`),
  };
};
