import { NPC_VOICE_BUSY, NPC_VOICE_MOVED, NPC_VOICE_PLAYER, startNpcVoice, type NpcVoiceDeps } from "./npcVoice";
import { wrote } from "@utils/writeResult";

const deps = (over: Partial<NpcVoiceDeps> & { busyFor?: number } = {}) => {
  let busyLeft = over.busyFor ?? 0;
  const order: string[] = [];
  const base: NpcVoiceDeps = {
    busy: () => busyLeft > 0,
    playerLines: () => 1,
    live: () => true,
    start: jest.fn(async () => { order.push("start"); return wrote(); }),
    sleep: async () => { order.push("sleep"); busyLeft -= 1; },
  };
  return { order, deps: { ...base, ...over } };
};

describe("v3.0 19 stage 3: an NPC llm reply starts through the guarded voice starter, never over another voice", () => {
  it("waits while a reply is being written or a chain holds the floor, then starts once", async () => {
    const { order, deps: d } = deps({ busyFor: 3 });
    expect(await startNpcVoice(d)).toEqual({ ok: true });
    expect(order).toEqual(["sleep", "sleep", "sleep", "start"]);
  });

  it("gives up after the wait instead of starting into a running chain", async () => {
    const { deps: d } = deps({ busyFor: 1000, waitMs: 300 });
    expect(await startNpcVoice(d)).toEqual({ ok: false, reason: NPC_VOICE_BUSY });
    expect(d.start).not.toHaveBeenCalled();
  });

  it("yields to the player: a player line written while it waited means it never starts", async () => {
    let lines = 1;
    const { deps: d } = deps({ busyFor: 2, playerLines: () => lines, sleep: async () => { lines = 2; } });
    d.busy = (() => { let left = 2; return () => left-- > 0; })();
    expect(await startNpcVoice(d)).toEqual({ ok: false, reason: NPC_VOICE_PLAYER });
    expect(d.start).not.toHaveBeenCalled();
  });

  it("a chat that moved during the wait gets nothing", async () => {
    let alive = true;
    const { deps: d } = deps({ busyFor: 1, live: () => alive, sleep: async () => { alive = false; } });
    d.busy = (() => { let left = 1; return () => left-- > 0; })();
    expect(await startNpcVoice(d)).toEqual({ ok: false, reason: NPC_VOICE_MOVED });
    expect(d.start).not.toHaveBeenCalled();
  });

  it("control: an idle host starts at once with no wait", async () => {
    const { order, deps: d } = deps();
    expect(await startNpcVoice(d)).toEqual({ ok: true });
    expect(order).toEqual(["start"]);
  });
});
