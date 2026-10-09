import { EDIT_NOT_READ_SUMMARY, EditReread, p95, type EditRereadHost, type EditTimers, type RereadOutcome } from "./editReread";
import { readEdited } from "./editRereadHost";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "../settingsModel";
import { beginRun } from "../runToken";
import { STEP_WINDOW, SpikeWorld, differentText, project, randomScript, seededRandom, type SpikeProjection, type SpikeTurn } from "../../../test/support/spikeHarness";
import { spikeContext, spikeEvents } from "../../../test/support/spikeHost";
import type { RuntimeManager } from "../runtimeManager";
import { testOwnership } from "../../../test/findings/testOwnership";

jest.mock("@services/STAPI", () => jest.requireActual("../../../test/support/spikeHost").spikeStapi);

type Arm = "reread" | "off" | "no-requeue";

const SEEDS = [1, 2, 3, 4];
const CUTS = 200;

class ManualTimers implements EditTimers {
  private next = 0;
  readonly jobs = new Map<number, { run: () => void; ms: number }>();
  set(run: () => void, ms: number) {
    this.next += 1;
    this.jobs.set(this.next, { run, ms });
    return this.next;
  }
  clear(handle: unknown) {
    this.jobs.delete(handle as number);
  }
  fire(ms?: number) {
    const due = [...this.jobs.entries()].filter(([, job]) => ms === undefined || job.ms === ms);
    for (const [id] of due) this.jobs.delete(id);
    due.forEach(([, job]) => job.run());
  }
}

const drainReads = (world: SpikeWorld) => async (messageId: number): Promise<RereadOutcome> => {
  await world.reader.read({ from: Math.max(0, messageId - STEP_WINDOW + 1), to: messageId }, `edit:${messageId}`);
  await world.manager.commitBoundary();
  return "committed";
};

const displaceOf = (world: SpikeWorld) => () => {
  const reader = world.reader as unknown as { queue: Array<{ reason: string }> };
  const before = reader.queue.length;
  reader.queue = reader.queue.filter((job) => !job.reason.startsWith("rollback:"));
  return before - reader.queue.length;
};

const withoutRequeue = (manager: RuntimeManager): EditRereadHost => ({
  getEngineState: () => manager.getEngineState(),
  getOwnership: () => manager.getOwnership(),
  onBoundary: (listener) => manager.onBoundary(listener),
  onRollback: (listener) => manager.onRollback(listener),
  rollbackFromMessage: (messageId, decoded, kind) => manager.rollbackFromMessage(messageId, decoded, kind),
  commitBoundary: (at) => manager.commitBoundary(at),
  writes: { requeue: () => undefined },
});

const chatNow = () => ({ id: String(spikeContext.chatId ?? ""), rows: spikeContext.chat });

const armed = async (arm: Arm, journal: Array<[string, string]> = []) => {
  const world = await SpikeWorld.open();
  const timers = new ManualTimers();
  const host: EditRereadHost = arm === "no-requeue" ? withoutRequeue(world.manager) : world.manager;
  const edit = new EditReread({
    host, enabled: () => arm !== "off", chat: chatNow, reread: drainReads(world), displace: displaceOf(world), timers, holdCapMs: 15_000, settleMs: 750,
    journal: (summary, detail) => { journal.push([summary, detail]); },
  });
  world.bridge.setMutationSeam((kind, messageId, entered) => edit.seam(kind, messageId, entered));
  const settleEdit = async (messageId: number, texts: string[], events?: string[]) => {
    await world.edit(messageId, texts, events);
    timers.fire(750);
    await edit.settled();
    await world.settle();
  };
  return { world, edit, timers, settleEdit, journal };
};

interface EditOutcome {
  projection: SpikeProjection;
  firedAtEdited: boolean;
  recommits: number;
  cycles: number;
  reads: number;
}

const editPath = async (turns: SpikeTurn[], text: string, arm: Arm): Promise<EditOutcome> => {
  const { world, edit, settleEdit } = await armed(arm);
  await world.play(turns);
  const id = spikeContext.chat.length - 1;
  const firedAtEdited = world.boundaries.some((boundary) => boundary.messageId === id && boundary.fired);
  await settleEdit(id, [text]);
  const outcome = { projection: project(world.manager), firedAtEdited, recommits: edit.stats.recommits, cycles: edit.stats.cycles, reads: edit.stats.reads };
  edit.dispose();
  world.close();
  return outcome;
};

const replay = async (turns: SpikeTurn[], text: string): Promise<SpikeProjection> => {
  const world = await SpikeWorld.open();
  await world.play([...turns.slice(0, -1), { user: turns[turns.length - 1].user, reply: text }]);
  const id = spikeContext.chat.length - 1;
  await world.reader.read({ from: Math.max(0, id - STEP_WINDOW + 1), to: id }, `replay:${id}`);
  await world.manager.commitBoundary();
  await world.settle();
  const projection = project(world.manager);
  world.close();
  return projection;
};

const cutsOf = (seed: number) => {
  const random = seededRandom(seed);
  return Array.from({ length: CUTS }, () => {
    const turns = randomScript(random);
    return { turns, text: differentText(random, turns[turns.length - 1].reply) };
  });
};

const firstUnequal = async (arm: Arm) => {
  for (const seed of SEEDS) {
    for (const [index, cut] of cutsOf(seed).entries()) {
      const edited = await editPath(cut.turns, cut.text, arm);
      if (JSON.stringify(edited.projection) !== JSON.stringify(await replay(cut.turns, cut.text))) return { seed, cut: index };
    }
  }
  return null;
};

jest.setTimeout(900000);

describe("v2.7 33 W1 V1: the settled re-read equals a replay of the edited chat (4 seeds x 200 cuts, real manager)", () => {
  it("every cut's edit path equals the fresh replay of the edited chat, with one read per settled edit", async () => {
    const unequal: Array<{ seed: number; cut: number; edited: SpikeProjection; replayed: SpikeProjection }> = [];
    const tally = { cuts: 0, firedAtEdited: 0, recommitted: 0, cycles: 0, reads: 0 };
    for (const seed of SEEDS) {
      for (const [index, cut] of cutsOf(seed).entries()) {
        const edited = await editPath(cut.turns, cut.text, "reread");
        const replayed = await replay(cut.turns, cut.text);
        tally.cuts += 1;
        tally.firedAtEdited += edited.firedAtEdited ? 1 : 0;
        tally.recommitted += edited.recommits > 0 ? 1 : 0;
        tally.cycles += edited.cycles;
        tally.reads += edited.reads;
        if (JSON.stringify(edited.projection) !== JSON.stringify(replayed)) unequal.push({ seed, cut: index, edited: edited.projection, replayed });
      }
    }
    console.log(`v2.7 33 V1 ${JSON.stringify({ ...tally, equal: tally.cuts - unequal.length, unequal: unequal.length, first: unequal[0] ?? null })}`);
    expect(unequal.slice(0, 3)).toEqual([]);
    expect(tally.cuts).toBe(SEEDS.length * CUTS);
    expect(tally.cycles).toBe(tally.cuts);
    expect(tally.reads).toBe(tally.cuts);
    expect(tally.firedAtEdited).toBeGreaterThan(0);
    expect(tally.recommitted).toBeGreaterThan(0);
  });

  it("control: with the flag off (today's rollback alone) some cut differs from the replay", async () => {
    const found = await firstUnequal("off");
    console.log(`v2.7 33 V1 control flag-off first unequal ${JSON.stringify(found)}`);
    expect(found).not.toBeNull();
  });

  it("control: the re-read without re-enqueueing the rolled-back writes differs from the replay on some cut", async () => {
    const found = await firstUnequal("no-requeue");
    console.log(`v2.7 33 V1 control no-requeue first unequal ${JSON.stringify(found)}`);
    expect(found).not.toBeNull();
  });
});

describe("v2.7 33 W1 V2: one cycle per settled burst", () => {
  const script: SpikeTurn[] = [{ user: "rain", reply: "song" }, { user: "fire", reply: "bread" }, { user: "path", reply: "stone" }];

  const played = async (arm: Arm = "reread") => {
    const setup = await armed(arm);
    await setup.world.play(script);
    return { ...setup, newest: spikeContext.chat.length - 1 };
  };

  const boundariesAt = (world: SpikeWorld, messageId: number, since: number) => world.boundaries.slice(since).filter((boundary) => boundary.messageId === messageId);

  it("(a) an edit of an older reply is left to the ordinary rollback", async () => {
    const { world, edit, timers, newest } = await played();
    await world.edit(newest - 2, ["go"]);
    expect(timers.jobs.size).toBe(0);
    expect(edit.stats).toMatchObject({ edits: 0, cycles: 0, reads: 0 });
    world.close();
  });

  it("(b) two settled edits with different texts: one cycle and one read each, the last boundary on each text", async () => {
    const { world, edit, settleEdit, newest } = await played();
    for (const text of ["key go", "halt drop"]) {
      const since = world.boundaries.length;
      const before = edit.stats.reads;
      await settleEdit(newest, [text]);
      expect(edit.stats.reads - before).toBe(1);
      const at = boundariesAt(world, newest, since);
      expect(at[at.length - 1]?.text).toBe(text);
    }
    expect(edit.stats.cycles).toBe(2);
    world.close();
  });

  it("(c) ST's editor pair (MESSAGE_EDITED then MESSAGE_UPDATED) is one cycle", async () => {
    const { edit, settleEdit, newest, world } = await played();
    await settleEdit(newest, ["go key"], ["MESSAGE_EDITED", "MESSAGE_UPDATED"]);
    expect(edit.stats).toMatchObject({ cycles: 1, reads: 1 });
    world.close();
  });

  it.each([2, 3, 4, 5])("(d) a post-processor burst of %i rewrites (MESSAGE_EDITED only, back to back) is one cycle, on the last text", async (count) => {
    const { world, edit, settleEdit, newest } = await played();
    const texts = ["go", "go key", "halt", "key", "go drop"].slice(0, count);
    const since = world.boundaries.length;
    await settleEdit(newest, texts, ["MESSAGE_EDITED"]);
    expect(edit.stats).toMatchObject({ cycles: 1, reads: 1 });
    const at = boundariesAt(world, newest, since);
    expect(at.length).toBeGreaterThan(0);
    expect(at.every((boundary) => boundary.text === texts[texts.length - 1])).toBe(true);
    world.close();
  });

  it("(e) a no-op edit (same text) never reaches the seam", async () => {
    const { world, edit, timers, newest } = await played();
    await world.edit(newest, [spikeContext.chat[newest].mes]);
    expect(timers.jobs.size).toBe(0);
    expect(edit.stats.cycles).toBe(0);
    world.close();
  });

  it("(f) flag off: nothing is held or re-read", async () => {
    const { world, edit, timers, newest } = await played("off");
    await world.edit(newest, ["go key"]);
    expect(timers.jobs.size).toBe(0);
    expect(edit.stats).toMatchObject({ edits: 0, cycles: 0, reads: 0 });
    await expect(edit.hold("normal")).resolves.toBeUndefined();
    expect(edit.stats.holds).toBe(0);
    world.close();
  });

  it("owns the re-read of its own rollback, so the scheduler queues no second one (R5′), and only while that rollback runs", async () => {
    const { world, edit, settleEdit } = await armed("reread");
    await world.play([{ user: "go", reply: "rain" }, { user: "fire", reply: "song" }]);
    const seen: boolean[] = [];
    world.manager.onRollback(() => { seen.push(edit.ownsReread()); });
    await settleEdit(spikeContext.chat.length - 1, ["key go"]);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(Boolean)).toBe(true);
    expect(edit.ownsReread()).toBe(false);
    world.close();
  });

  it("a swipe or a delete of the newest reply is left to the bridge", async () => {
    const { world, edit, newest } = await played();
    expect(edit.seam("swipe", newest)).toBeNull();
    expect(edit.seam("delete", newest)).toBeNull();
    world.close();
  });
});

describe("v2.7 33 W1 V5/V6: the hold", () => {
  const script: SpikeTurn[] = [{ user: "rain", reply: "song" }, { user: "fire", reply: "bread" }];

  it("with no pending edit the hold is free: no wait, no restage, no stats", async () => {
    const restaged: string[] = [];
    const world = await SpikeWorld.open();
    const edit = new EditReread({ host: world.manager, enabled: () => true, chat: chatNow, reread: drainReads(world), displace: displaceOf(world), journal: () => undefined, restage: (type) => { restaged.push(type); }, timers: new ManualTimers() });
    await edit.hold("normal");
    expect(edit.stats.holds).toBe(0);
    expect(restaged).toEqual([]);
    world.close();
  });

  it("a send during the settle window waits for the cycle, then re-stages what generation start set", async () => {
    const restaged: string[] = [];
    const world = await SpikeWorld.open();
    const timers = new ManualTimers();
    let clock = 0;
    const edit = new EditReread({
      host: world.manager, enabled: () => true, chat: chatNow, reread: drainReads(world), displace: displaceOf(world), journal: () => undefined,
      restage: (type) => { restaged.push(type); }, timers, now: () => clock,
    });
    world.bridge.setMutationSeam((kind, messageId, entered) => edit.seam(kind, messageId, entered));
    await world.play(script);
    const newest = spikeContext.chat.length - 1;
    await world.edit(newest, ["go"], ["MESSAGE_EDITED"]);
    const held = edit.hold("normal");
    clock = 1200;
    timers.fire(750);
    await held;
    expect(restaged).toEqual(["normal"]);
    expect(edit.stats).toMatchObject({ holds: 1, timeouts: 0, cycles: 1 });
    expect(p95(edit.stats.holdMs)).toBe(1200);
    expect(world.manager.getEngineState()?.blackboard.values.go).toBe(true);
    world.close();
  });

  it("quiet and impersonate generations are never held", async () => {
    const world = await SpikeWorld.open();
    const timers = new ManualTimers();
    const edit = new EditReread({ host: world.manager, enabled: () => true, chat: chatNow, reread: drainReads(world), displace: displaceOf(world), journal: () => undefined, timers });
    world.bridge.setMutationSeam((kind, messageId, entered) => edit.seam(kind, messageId, entered));
    await world.play(script);
    await world.edit(spikeContext.chat.length - 1, ["go"], ["MESSAGE_EDITED"]);
    await edit.hold("quiet");
    await edit.hold("impersonate");
    expect(edit.stats.holds).toBe(0);
    timers.fire(750);
    await edit.settled();
    world.close();
  });

  it("V6: a hung read releases at the cap, the reply goes out, and the journal says the edit was not read in time", async () => {
    const journal: Array<[string, string]> = [];
    const world = await SpikeWorld.open();
    const timers = new ManualTimers();
    const edit = new EditReread({ host: world.manager, enabled: () => true, chat: chatNow, reread: () => new Promise<RereadOutcome>(() => undefined), journal: (summary, detail) => { journal.push([summary, detail]); }, timers, holdCapMs: 15_000 });
    world.bridge.setMutationSeam((kind, messageId, entered) => edit.seam(kind, messageId, entered));
    await world.play(script);
    await world.edit(spikeContext.chat.length - 1, ["go"], ["MESSAGE_EDITED"]);
    const held = edit.hold("normal");
    timers.fire(750);
    await world.settle();
    timers.fire(15_000);
    await held;
    expect(edit.stats).toMatchObject({ holds: 1, timeouts: 1 });
    expect(journal).toHaveLength(1);
    expect(journal[0][0]).toBe(EDIT_NOT_READ_SUMMARY);
    world.close();
  });
});

describe("v2.7 33 W1 V7: the C12 interaction (an edit the onEnter rollback already stepped back)", () => {
  const gating: SpikeTurn[] = [{ user: "go", reply: "rain" }, { user: "fire", reply: "song" }];

  const enteredEdit = async (text: string) => {
    const { world, edit, timers } = await armed("reread");
    await world.play(gating);
    const id = spikeContext.chat.length - 1;
    const manager = world.manager as RuntimeManager & { rollbackOnEnter: RuntimeManager["rollbackOnEnter"] };
    manager.rollbackOnEnter = async (_kind, messageId) => {
      await world.manager.rollbackFromMessage(messageId);
      return true;
    };
    await world.edit(id, [text], ["MESSAGE_EDITED"]);
    timers.fire(750);
    await edit.settled();
    await world.settle();
    const outcome = { projection: project(world.manager), stats: { ...edit.stats } };
    world.close();
    return outcome;
  };

  it("re-fires the transition only when the edited text still satisfies the gate, ending like a replay of the edited chat", async () => {
    const ends: string[] = [];
    for (const text of ["key", "halt"]) {
      const edited = await enteredEdit(text);
      expect(edited.stats).toMatchObject({ cycles: 1, reads: 1 });
      expect(edited.projection).toEqual(await replay(gating, text));
      ends.push(edited.projection.engine.active);
    }
    console.log(`v2.7 33 V7 ${JSON.stringify(ends)}`);
    expect(new Set(ends).size).toBe(2);
  });
});

describe("v2.7 33 W1 V0: the traced post-processor orders, replayed against the real manager", () => {
  const script: SpikeTurn[] = [{ user: "rain", reply: "song" }, { user: "fire", reply: "bread" }];
  const gating: SpikeTurn[] = [{ user: "go", reply: "rain" }, { user: "fire", reply: "song" }];

  const groupRound = async (world: SpikeWorld, user: string, reply: string, rewrite?: string) => {
    const chat = spikeContext.chat;
    spikeContext.generating = true;
    chat.push({ name: "Player", is_user: true, mes: user, send_date: `t${chat.length}` });
    await spikeEvents.emit("MESSAGE_SENT", chat.length - 1);
    chat.push({ name: "Guide", is_user: false, mes: reply, send_date: `t${chat.length}`, swipes: [reply], swipe_id: 0 });
    const id = chat.length - 1;
    await spikeEvents.emit("MESSAGE_RECEIVED", id, "normal");
    if (rewrite !== undefined) {
      chat[id].mes = rewrite;
      chat[id].swipes = [rewrite];
      await spikeEvents.emit("MESSAGE_EDITED", id);
    }
    await spikeEvents.emit("CHARACTER_MESSAGE_RENDERED", id, "normal");
    await world.settle();
    spikeContext.generating = false;
    await spikeEvents.emit("GENERATION_ENDED");
    await world.settle();
    return id;
  };

  const playedAs = async (turns: SpikeTurn[]): Promise<SpikeProjection> => {
    const world = await SpikeWorld.open();
    await world.play(turns);
    const projection = project(world.manager);
    world.close();
    return projection;
  };

  const gatedRead = (world: SpikeWorld, gates: Array<() => void>) => async (messageId: number): Promise<RereadOutcome> => {
    const seen = spikeContext.chat.map((row) => row.mes);
    await new Promise<void>((resolve) => gates.push(resolve));
    const now = spikeContext.chat.map((row) => row.mes);
    seen.forEach((mes, index) => { spikeContext.chat[index].mes = mes; });
    await world.reader.read({ from: Math.max(0, messageId - STEP_WINDOW + 1), to: messageId }, `edit:${messageId}`);
    now.forEach((mes, index) => { spikeContext.chat[index].mes = mes; });
    await world.manager.commitBoundary();
    return "committed";
  };

  const gatedWorld = async (turns: SpikeTurn[]) => {
    const world = await SpikeWorld.open();
    const timers = new ManualTimers();
    const gates: Array<() => void> = [];
    const restaged: string[] = [];
    const journal: Array<[string, string]> = [];
    const edit = new EditReread({
      host: world.manager, enabled: () => true, chat: chatNow, reread: gatedRead(world, gates), displace: displaceOf(world), timers,
      journal: (summary, detail) => { journal.push([summary, detail]); }, restage: (type) => { restaged.push(type); },
    });
    world.bridge.setMutationSeam((kind, messageId, entered) => edit.seam(kind, messageId, entered));
    await world.play(turns);
    return { world, timers, gates, restaged, journal, edit, newest: spikeContext.chat.length - 1 };
  };

  it("a Regex-extension rewrite (alter chat, AI output) is already in the reply when MESSAGE_RECEIVED fires: no edit event, no cycle, the boundary reads the rewritten text", async () => {
    const { world, edit } = await armed("reread");
    await world.play(script);
    const since = world.boundaries.length;
    const id = await groupRound(world, "path", "go key");
    expect(edit.stats).toMatchObject({ edits: 0, cycles: 0, reads: 0 });
    expect(world.boundaries.slice(since).filter((boundary) => boundary.messageId === id).map((boundary) => boundary.text)).toEqual(["go key"]);
    expect(project(world.manager)).toEqual(await playedAs([...script, { user: "path", reply: "go key" }]));
    world.close();
  });

  it("a Recast-shaped rewrite inside the group round lands before our commit (the flush waits for the round): no cycle, every boundary reads the rewritten text, at the cost of a second boundary and read", async () => {
    const { world, edit } = await armed("reread");
    await world.play(script);
    const since = world.boundaries.length;
    const id = await groupRound(world, "path", "stone", "go key");
    expect(edit.stats).toMatchObject({ edits: 0, cycles: 0, reads: 0 });
    const atId = world.boundaries.slice(since).filter((boundary) => boundary.messageId === id).map((boundary) => boundary.text);
    expect(atId).toEqual(["go key", "go key"]);
    expect(world.reader.reasons.filter((reason) => reason === "cadence")).toHaveLength(4);
    expect(project(world.manager)).toEqual(await playedAs([...script, { user: "path", reply: "go key" }]));
    world.close();
  });

  it("a rewrite that lands after the settle window fired, while the first cycle still reads, holds the reply until the last text is read (the v2.6 'no audit' shape)", async () => {
    const { world, timers, gates, restaged, journal, edit, newest } = await gatedWorld(gating);
    expect(world.boundaries.some((boundary) => boundary.messageId === newest && boundary.fired)).toBe(true);
    await world.edit(newest, ["go"], ["MESSAGE_EDITED"]);
    let released = false;
    const held = edit.hold("normal").then(() => { released = true; });
    timers.fire(750);
    await world.settle();
    expect(gates).toHaveLength(1);
    await world.edit(newest, ["go key"], ["MESSAGE_EDITED"]);
    gates.shift()?.();
    await world.settle();
    expect(released).toBe(false);
    timers.fire(750);
    await world.settle();
    expect(released).toBe(false);
    expect(gates).toHaveLength(1);
    gates.shift()?.();
    await held;
    await edit.settled();
    await world.settle();
    expect(edit.stats).toMatchObject({ edits: 2, cycles: 2, reads: 2, skipped: 0, holds: 1, timeouts: 0 });
    expect(restaged).toEqual(["normal"]);
    expect(journal).toEqual([]);
    expect(JSON.stringify(world.manager.getSessionJournal())).not.toContain("eventless change");
    expect(project(world.manager)).toEqual(await replay(gating, "go key"));
    world.close();
  });

  it("control (the v2.6 mechanism): if the rewrite the seam takes leaves its fingerprint, the first read's own commit steps back as an eventless change and erases the audit it just wrote", async () => {
    const { world, timers, gates, edit, newest } = await gatedWorld(gating);
    const fingerprints = world.manager.chatSave.fingerprints;
    const forget = fingerprints.forgetFrom.bind(fingerprints);
    let kept = false;
    fingerprints.forgetFrom = (messageId: number) => { if (!kept) forget(messageId); };
    await world.edit(newest, ["go"], ["MESSAGE_EDITED"]);
    timers.fire(750);
    await world.settle();
    kept = true;
    await world.edit(newest, ["go key"], ["MESSAGE_EDITED"]);
    kept = false;
    gates.shift()?.();
    await world.settle();
    expect(edit.stats.reads).toBe(1);
    expect(world.reader.reasons).toContain(`edit:${newest}`);
    expect(world.manager.getExtractionAudits().some((audit) => audit.reason === `edit:${newest}`)).toBe(false);
    expect(JSON.stringify(world.manager.getSessionJournal())).toContain(`eventless change at message ${newest}`);
    timers.fire(750);
    await world.settle();
    gates.shift()?.();
    await edit.settled();
    await world.settle();
    world.close();
  });

  it("control: a rewrite after the cycle finished is a fresh cycle, and the hold that already released is not held again", async () => {
    const { world, timers, gates, edit, newest } = await gatedWorld(script);
    await world.edit(newest, ["go"], ["MESSAGE_EDITED"]);
    const first = edit.hold("normal");
    timers.fire(750);
    await world.settle();
    gates.shift()?.();
    await first;
    await edit.settled();
    await world.settle();
    expect(edit.isPending()).toBe(false);
    await world.edit(newest, ["go key"], ["MESSAGE_EDITED"]);
    expect(edit.isPending()).toBe(true);
    timers.fire(750);
    await world.settle();
    gates.shift()?.();
    await edit.settled();
    await world.settle();
    expect(edit.stats).toMatchObject({ edits: 2, cycles: 2, reads: 2, holds: 1 });
    expect(project(world.manager)).toEqual(await replay(script, "go key"));
    world.close();
  });
});

describe("v2.7 33 W1: the host read", () => {
  it("reads the edited message's window under the edit's re-read reason, and refuses once the run lapsed", async () => {
    const asked: unknown[] = [];
    const manager = { runExtractionNow: async (...args: unknown[]) => { asked.push(args); return true; } } as never;
    await expect(readEdited(manager, 9, beginRun(testOwnership()))).resolves.toBe("committed");
    expect(asked).toEqual([[undefined, "rollback:9:edit", { from: 2, to: 9 }]]);
    const lapsed = beginRun({ mint: testOwnership().mint, check: () => ({ ok: false, reason: "chat" }) } as never);
    await expect(readEdited(manager, 9, lapsed)).resolves.toBe("unread");
    expect(asked).toHaveLength(1);
  });
});

describe("v2.7 33 W1: the install-wide flag", () => {
  it("is on by default (owner decision 2026-10-09) and off only for a literal false", () => {
    expect(defaultGlobalSettings().spikes.editReread).toBe(true);
    expect(sanitizeGlobalSettings({ spikes: { editReread: "no" } }).spikes.editReread).toBe(true);
    expect(sanitizeGlobalSettings({ spikes: { editReread: false } }).spikes.editReread).toBe(false);
  });
});
