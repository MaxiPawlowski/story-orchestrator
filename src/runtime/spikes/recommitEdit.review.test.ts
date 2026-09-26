import type { RuntimeManager } from "../runtimeManager";
import { beginRun } from "../runToken";
import type { MutationKind } from "../turnBridge";
import { RecommitEdit, type RecommitHost } from "./recommitEdit";
import { defaultGlobalSettings, sanitizeGlobalSettings } from "../settingsModel";
import { STEP_WINDOW, SpikeWorld, differentText, project, randomScript, seededRandom, type SpikeProjection, type SpikeTurn } from "../../../test/support/spikeHarness";
import { spikeContext } from "../../../test/support/spikeHost";

jest.mock("@services/STAPI", () => jest.requireActual("../../../test/support/spikeHost").spikeStapi);

type Arm = "spike" | "off" | "no-requeue";

const SEEDS = [1, 2, 3, 4];
const CUTS = 200;

const stepRead = (world: SpikeWorld) => async (messageId: number) => {
  await world.reader.read({ from: Math.max(0, messageId - STEP_WINDOW + 1), to: messageId }, `recommit:${messageId}`);
  await world.manager.commitBoundary();
};

const withoutRequeue = (manager: RuntimeManager): RecommitHost => ({
  getEngineState: () => manager.getEngineState(),
  getOwnership: () => manager.getOwnership(),
  onBoundary: (listener) => manager.onBoundary(listener),
  onRollback: (listener) => manager.onRollback(listener),
  rollbackFromMessage: (messageId) => manager.rollbackFromMessage(messageId),
  commitBoundary: (at) => manager.commitBoundary(at),
  writes: { requeue: () => undefined },
});

const chatNow = () => ({ id: String(spikeContext.chatId ?? ""), rows: spikeContext.chat });

class MutantWithoutNewestCheck extends RecommitEdit {
  constructor(private readonly world: SpikeWorld) {
    super({ host: world.manager, enabled: () => true, chat: chatNow, read: stepRead(world) });
  }

  seam(kind: MutationKind, messageId: number) {
    if (kind !== "edit" && kind !== "update") return null;
    const run = beginRun(this.world.manager.getOwnership());
    return () => this.cycle(messageId, run);
  }
}

const armed = async (arm: Arm) => {
  const world = await SpikeWorld.open();
  const host: RecommitHost = arm === "no-requeue" ? withoutRequeue(world.manager) : world.manager;
  const spike = new RecommitEdit({ host, enabled: () => arm !== "off", chat: chatNow, read: stepRead(world) });
  world.bridge.setMutationSeam((kind, messageId) => spike.seam(kind, messageId));
  return { world, spike };
};

interface EditOutcome {
  projection: SpikeProjection;
  firedAtEdited: boolean;
  recommits: number;
  cycles: number;
}

const editPath = async (turns: SpikeTurn[], text: string, arm: Arm): Promise<EditOutcome> => {
  const { world, spike } = await armed(arm);
  await world.play(turns);
  const id = spikeContext.chat.length - 1;
  const firedAtEdited = world.boundaries.some((boundary) => boundary.messageId === id && boundary.fired);
  await world.edit(id, [text]);
  const outcome = { projection: project(world.manager), firedAtEdited, recommits: spike.stats.recommits, cycles: spike.stats.cycles };
  spike.dispose();
  world.close();
  return outcome;
};

const replay = async (turns: SpikeTurn[], text: string): Promise<SpikeProjection> => {
  const world = await SpikeWorld.open();
  await world.play([...turns.slice(0, -1), { user: turns[turns.length - 1].user, reply: text }]);
  await stepRead(world)(spikeContext.chat.length - 1);
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

describe("v2.5 plan 09 SP2 R2: re-commit equals replay (4 seeds x 200 cuts, real manager)", () => {
  it("every cut's edit path equals the fresh replay of the edited chat", async () => {
    const unequal: Array<{ seed: number; cut: number; edited: SpikeProjection; replayed: SpikeProjection }> = [];
    const tally = { cuts: 0, firedAtEdited: 0, recommitted: 0, cycles: 0, memoryRows: 0, withValues: 0 };
    for (const seed of SEEDS) {
      for (const [index, cut] of cutsOf(seed).entries()) {
        const edited = await editPath(cut.turns, cut.text, "spike");
        const replayed = await replay(cut.turns, cut.text);
        tally.cuts += 1;
        tally.firedAtEdited += edited.firedAtEdited ? 1 : 0;
        tally.recommitted += edited.recommits > 0 ? 1 : 0;
        tally.cycles += edited.cycles;
        tally.memoryRows += replayed.memory.length;
        tally.withValues += Object.keys(replayed.engine.values).length ? 1 : 0;
        if (JSON.stringify(edited.projection) !== JSON.stringify(replayed)) unequal.push({ seed, cut: index, edited: edited.projection, replayed });
      }
    }
    console.log(`SP2 R2 ${JSON.stringify({ ...tally, equal: tally.cuts - unequal.length, unequal: unequal.length, first: unequal[0] ?? null })}`);
    expect(unequal.slice(0, 3)).toEqual([]);
    expect(tally.cuts).toBe(SEEDS.length * CUTS);
    expect(tally.cycles).toBe(tally.cuts);
    expect(tally.firedAtEdited).toBeGreaterThan(0);
    expect(tally.recommitted).toBeGreaterThan(0);
    expect(tally.memoryRows).toBeGreaterThan(tally.cuts);
    expect(tally.withValues).toBeGreaterThan(tally.cuts / 2);
  });

  it("control: with the flag off (today's rollback alone) some cut differs from the replay", async () => {
    const found = await firstUnequal("off");
    console.log(`SP2 R2 control flag-off first unequal ${JSON.stringify(found)}`);
    expect(found).not.toBeNull();
  });

  it("control: the spike without re-enqueueing the rolled-back writes differs from the replay on some cut", async () => {
    const found = await firstUnequal("no-requeue");
    console.log(`SP2 R2 control no-requeue first unequal ${JSON.stringify(found)}`);
    expect(found).not.toBeNull();
  });
});

describe("v2.5 plan 09 SP2 R3: no double commit", () => {
  const script: SpikeTurn[] = [{ user: "rain", reply: "song" }, { user: "fire", reply: "bread" }, { user: "path", reply: "stone" }];

  const played = async (arm: Arm = "spike") => {
    const setup = await armed(arm);
    await setup.world.play(script);
    return { ...setup, newest: spikeContext.chat.length - 1 };
  };

  const boundariesAt = (world: SpikeWorld, messageId: number, since: number) => world.boundaries.slice(since).filter((boundary) => boundary.messageId === messageId);

  it("(a) an edit of an older reply is not re-committed", async () => {
    const { world, spike, newest } = await played();
    await world.edit(newest - 2, ["go"]);
    expect(spike.stats).toEqual({ cycles: 0, recommits: 0, reads: 0, skipped: 0 });
    world.close();
  });

  it("(a) control: a spike without the newest-reply check re-commits the older edit", async () => {
    const world = await SpikeWorld.open();
    const mutant = new MutantWithoutNewestCheck(world);
    world.bridge.setMutationSeam((kind, messageId) => mutant.seam(kind, messageId));
    await world.play(script);
    await world.edit(spikeContext.chat.length - 3, ["go"]);
    expect(mutant.stats.cycles).toBeGreaterThan(0);
    world.close();
  });

  it("(b) two edits with different texts: one cycle and one step-3 boundary per text", async () => {
    const { world, spike, newest } = await played();
    const perEdit: number[] = [];
    for (const text of ["key go", "halt drop"]) {
      const since = world.boundaries.length;
      const before = spike.stats.reads;
      await world.edit(newest, [text]);
      expect(spike.stats.reads - before).toBe(1);
      const at = boundariesAt(world, newest, since);
      expect(at[at.length - 1]?.text).toBe(text);
      perEdit.push(at.length);
    }
    expect(spike.stats.cycles).toBe(2);
    expect(perEdit.every((count) => count >= 1 && count <= 2)).toBe(true);
    console.log(`SP2 R3 (b) ${JSON.stringify({ stats: spike.stats, boundariesAtEditedPerEdit: perEdit })}`);
    world.close();
  });

  it("(c) ST's editor pair (MESSAGE_EDITED then MESSAGE_UPDATED) for one edit is one cycle", async () => {
    const { world, spike, newest } = await played();
    await world.edit(newest, ["go key"], ["MESSAGE_EDITED", "MESSAGE_UPDATED"]);
    expect(spike.stats.cycles).toBe(1);
    expect(spike.stats.reads).toBe(1);
    console.log(`SP2 R3 (c) ${JSON.stringify(spike.stats)}`);
    world.close();
  });

  it("(d) recast-style rewrites (two texts, MESSAGE_EDITED only, back to back) are one cycle, for the settled text", async () => {
    const { world, spike, newest } = await played();
    const since = world.boundaries.length;
    await world.edit(newest, ["go", "go key"], ["MESSAGE_EDITED"]);
    expect(spike.stats.cycles).toBe(1);
    expect(spike.stats.reads).toBe(1);
    const at = boundariesAt(world, newest, since);
    expect(at.every((boundary) => boundary.text === "go key")).toBe(true);
    console.log(`SP2 R3 (d) ${JSON.stringify({ stats: spike.stats, boundariesAtEdited: at.length })}`);
    world.close();
  });

  it("(e) a no-op edit (same text) is not re-committed", async () => {
    const { world, spike, newest } = await played();
    await world.edit(newest, [spikeContext.chat[newest].mes]);
    expect(spike.stats.cycles).toBe(0);
    expect(spike.stats.reads).toBe(0);
    world.close();
  });

  it("(f) flag off: nothing is re-committed", async () => {
    const { world, spike, newest } = await played("off");
    await world.edit(newest, ["go key"]);
    expect(spike.stats).toEqual({ cycles: 0, recommits: 0, reads: 0, skipped: 0 });
    world.close();
  });

  it("a swipe or a delete of the newest reply is left to the bridge", async () => {
    const { world, spike, newest } = await played();
    expect(spike.seam("swipe", newest)).toBeNull();
    expect(spike.seam("delete", newest)).toBeNull();
    const cycle = spike.seam("edit", newest);
    expect(cycle).not.toBeNull();
    await cycle?.();
    expect(spike.stats).toEqual({ cycles: 0, recommits: 0, reads: 0, skipped: 1 });
    world.close();
  });
});

describe("v2.5 plan 09 SP2: the install-wide flag", () => {
  it("is off by default and on only for a literal true", () => {
    expect(defaultGlobalSettings().spikes.recommitEdit).toBe(false);
    expect(sanitizeGlobalSettings({}).spikes.recommitEdit).toBe(false);
    expect(sanitizeGlobalSettings({ spikes: { recommitEdit: "yes" } }).spikes.recommitEdit).toBe(false);
    expect(sanitizeGlobalSettings({ spikes: { recommitEdit: true } }).spikes.recommitEdit).toBe(true);
  });
});
