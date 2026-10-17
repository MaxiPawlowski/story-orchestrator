import { testOwnership } from "../../test/findings/testOwnership";
import type { RuntimeExtras } from "./types";
import { runRollback, type RollbackDeps } from "./rollback";
import { witnessAudit } from "@memory/witness/contract";
import { acceptWitnessRead, witnessLookup, witnessState } from "@memory/witness/record";
import { createWitness } from "@memory/witness/state";
import { createWitnessPort } from "./witnessPort";

jest.mock("@extraction/index", () => ({
  getChatWindow: () => ({ from: 0, to: 0, messages: [] }),
}));

const chat = Array.from({ length: 12 }, (_, id) => ({ messageId: id, text: `line ${id}` }));
const at = (from: number, to: number) => ({ from, to, messages: chat.slice(from, to + 1), present: ["mara", "ben"], resolveMember: (token: string) => token });

const record = () => {
  let state = acceptWitnessRead(createWitness(), "r1", witnessAudit("accepted", ["WITNESS m=2 heard=mara"], at(0, 4)).audit);
  state = acceptWitnessRead(state, "r2", witnessAudit("accepted", ["WITNESS m=2 heard=ben", "WITNESS m=6 heard=mara"], at(2, 7)).audit);
  return state;
};

function harness(engineMoves = false) {
  const extras = { extraction: { audits: [] }, judge: { calls: [], meter: {} }, lore: { fired: [] }, tension: { levels: [], smoothed: null, history: [] }, witness: record() } as unknown as RuntimeExtras;
  const deps = {
    ownership: testOwnership(),
    engine: {
      shouldRollbackFromMessage: () => engineMoves, boundaryBeforeMessage: () => 0, serialize: () => ({ boundary: 7, checkpointStartedMessageId: 0 }),
      clampToChat: () => false, discardPendingFrom: () => [], rollbackTo: () => ({ ok: true, result: "applied" }), ensureActiveCheckpoint: () => null, activeCheckpoint: null,
    },
    journal: { record: () => undefined },
    context: () => ({ lastMessageId: 9, chatLength: 10, journal: { boundary: 1, messageId: 9 } }),
    memory: { rollbackFromMessage: () => undefined, updateInjection: () => undefined },
    stagecraft: { revertAppliedSince: async () => undefined },
    pacing: { replayCommitted: () => undefined, updateSteering: () => undefined },
    revalidateExpansion: () => undefined, restoreExpansion: () => 0,
    extras: () => extras,
    refreshRequirements: () => undefined,
    reapplyCheckpoint: async () => undefined,
    persist: async () => undefined,
    notify: () => undefined,
    notices: { lastRollback: null, rollbackUnavailable: null },
    setStatus: () => undefined,
    onApplied: () => undefined,
  } as unknown as RollbackDeps;
  return { deps, extras };
}

describe("plan 42 B Wr: witness claims roll back by input range on every mutation path", () => {
  it.each([false, true])("an edit inside a read's range drops all its claims, earlier messages too (engine moves: %s)", async (moves) => {
    const h = harness(moves);
    expect(witnessLookup(h.extras.witness ?? createWitness(), "ben", 2).heard).toBe("yes");
    await runRollback(h.deps, 6);
    const after = h.extras.witness ?? createWitness();
    expect(after.reads.map((read) => read.readId)).toEqual(["r1"]);
    expect(witnessLookup(after, "ben", 2)).toMatchObject({ state: "classified", heard: "no" });
    expect(witnessState(after, 5)).toBe("invalidated");
  });

  it("the port writes accepted reads once loaded, records outages, and stays out when switched off", async () => {
    const extras = { memory: { settings: {} } } as unknown as RuntimeExtras;
    const story = { id: "s" } as never;
    const port = createWitnessPort({ getStory: () => story, extras: () => extras, enabledIds: () => ["mara"] });
    expect(port.present()).toEqual(["mara"]);
    const audit = { id: "a1", witness: witnessAudit("accepted", ["WITNESS m=1 heard=mara"], at(0, 3)).audit } as never;
    await port.ready(audit);
    port.apply(audit);
    port.outage({ from: 4, to: 6 });
    expect(witnessState(port.state(), 1)).toBe("classified");
    expect(witnessState(port.state(), 5)).toBe("outage");
    (extras.memory.settings as { witness?: boolean }).witness = false;
    expect(port.present()).toBeNull();
    port.apply({ id: "a2", witness: witnessAudit("accepted", ["WITNESS m=8 heard=mara"], at(7, 9)).audit } as never);
    expect(port.state().reads).toHaveLength(2);
  });
});
