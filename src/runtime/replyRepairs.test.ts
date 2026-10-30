import { REPLY_REPAIR_ORDER, createReplyRepairs, type ReplyRepair } from "./replyRepairs";

type Listener = (...args: unknown[]) => unknown;

class HostEmitter {
  private events: Listener[] = [];
  on(listener: Listener) { this.events.push(listener); }
  makeFirst(listener: Listener) {
    this.events = [listener, ...this.events.filter((entry) => entry !== listener)];
  }
  off(listener: Listener) { this.events = this.events.filter((entry) => entry !== listener); }
  async emit(...args: unknown[]) {
    for (const listener of [...this.events]) await listener(...args);
  }
  count() { return this.events.length; }
}

const harness = () => {
  const host = new HostEmitter();
  const calls: string[] = [];
  let listens = 0;
  const chain = createReplyRepairs((run) => {
    listens += 1;
    const listener = (messageId: unknown) => run(Number(messageId));
    host.makeFirst(listener);
    return () => host.off(listener);
  });
  const repair = (id: string): ReplyRepair => (messageId) => { calls.push(`${id}:${messageId}`); };
  return { host, calls, chain, repair, listens: () => listens };
};

describe("reply repairs run first, thought-leak before keep-last", () => {
  it("pins the order", () => {
    expect(REPLY_REPAIR_ORDER).toEqual(["thought-leak", "history-note", "keep-last"]);
  });

  it("runs ahead of a turn listener that subscribed earlier, whichever repair loaded first", async () => {
    const { host, calls, chain, repair, listens } = harness();
    host.on((messageId) => { calls.push(`turn:${String(messageId)}`); });
    chain.add("keep-last", repair("keep-last"));
    host.on((messageId) => { calls.push(`late:${String(messageId)}`); });
    chain.add("thought-leak", repair("thought-leak"));
    await host.emit(4, "normal");
    expect(calls).toEqual(["thought-leak:4", "keep-last:4", "turn:4", "late:4"]);
    expect(listens()).toBe(1);
  });

  it("keeps the turn listener reading what the repairs wrote", async () => {
    const { host, chain } = harness();
    const row = { mes: "raw" };
    const seen: string[] = [];
    host.on(() => { seen.push(row.mes); });
    chain.add("keep-last", () => { row.mes = `${row.mes}>trimmed`; });
    chain.add("thought-leak", () => { row.mes = `${row.mes}>leak`; });
    await host.emit(1);
    expect(seen).toEqual(["raw>leak>trimmed"]);
  });

  it("a failing repair does not stop the next one", async () => {
    const { host, calls, chain, repair } = harness();
    chain.add("thought-leak", () => { throw new Error("boom"); });
    chain.add("keep-last", repair("keep-last"));
    await host.emit(2);
    expect(calls).toEqual(["keep-last:2"]);
  });

  it("detaches the host listener once the last repair is removed", async () => {
    const { host, calls, chain, repair } = harness();
    const offLeak = chain.add("thought-leak", repair("thought-leak"));
    const offKeep = chain.add("keep-last", repair("keep-last"));
    offLeak();
    await host.emit(3);
    expect(calls).toEqual(["keep-last:3"]);
    expect(host.count()).toBe(1);
    offKeep();
    expect(host.count()).toBe(0);
  });
});
