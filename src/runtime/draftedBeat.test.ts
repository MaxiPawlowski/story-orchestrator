import { DraftedBeat, type DraftedId } from "./draftedBeat";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = () => {
  const gates = new Map<string, ReturnType<typeof deferred>>();
  const prepared = (gate: ReturnType<typeof deferred>) => gate.promise.then(() => true);
  const applied: DraftedId[] = [];
  const beat = new DraftedBeat({
    prepare: (id) => { const gate = deferred(); gates.set(JSON.stringify(id), gate); return prepared(gate); },
    apply: (id) => { applied.push(id); },
  });
  return { beat, gates, applied };
};

describe("DraftedBeat", () => {
  it("returns from the draft without waiting for the beat", () => {
    const { beat, applied } = setup();
    beat.drafted(3, true);
    expect(applied).toEqual([3]);
    expect(beat.hasPending()).toBe(true);
  });

  it("settle waits for the beat and applies the drafted member again", async () => {
    const { beat, gates, applied } = setup();
    beat.drafted(3, true);
    let settled = false;
    const settle = beat.settle().then(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);
    gates.get("3")!.resolve();
    await settle;
    expect(applied).toEqual([3, 3]);
    expect(beat.hasPending()).toBe(false);
  });

  it("does not apply a beat for a member who is no longer drafted", async () => {
    const { beat, gates, applied } = setup();
    beat.drafted(3, true);
    beat.drafted(5, false);
    gates.get("3")!.resolve();
    await flush();
    await beat.settle();
    expect(applied).toEqual([3, 5]);
  });

  it("applies once when no beat was prepared", async () => {
    const applied: DraftedId[] = [];
    const beat = new DraftedBeat({ prepare: () => Promise.resolve(false), apply: (id) => { applied.push(id); } });
    beat.drafted(4, true);
    await beat.settle();
    expect(applied).toEqual([4]);
  });

  it("a failed beat still settles", async () => {
    const applied: DraftedId[] = [];
    const beat = new DraftedBeat({ prepare: () => Promise.reject(new Error("model down")), apply: (id) => { applied.push(id); } });
    beat.drafted([2], true);
    await beat.settle();
    expect(applied).toEqual([[2]]);
  });
});
