import { applyArcSignals, rollbackArcs } from "@memory/index";
import { createLore, LORE_FIRED_LIMIT, loreFiredRecord, recordLoreFired, rollbackLoreFired, sanitizeLore, type LoreFiredRecord } from "./loreFired";
import { appendTensionHistory, rollbackTensionHistory, sanitizeTension, TENSION_HISTORY_LIMIT } from "./tensionState";
import type { LoreSlot } from "./worldInfoEvidence";
import type { TensionHistoryRow } from "./types";

const seeded = (seed: number) => {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
};

const record = (messageId: number): LoreFiredRecord => ({ messageId, entries: [{ book: "Town", uid: messageId, comment: `entry ${messageId}`, via: "key" }] });

describe("persisted inline data (v2.6 plan 08 task 1, blob 6)", () => {
  it("rollback ≡ replay for extras.lore.fired and tension.history", () => {
    for (const seed of [1, 7, 42, 99]) {
      const random = seeded(seed);
      const ids = Array.from({ length: 40 }, () => Math.floor(random() * 60));
      const levels = ["calm", "stirring", "tense", "critical", "peak"] as const;
      for (let cut = 0; cut <= 60; cut += 1) {
        const all = ids.reduce((state, messageId) => recordLoreFired(state, record(messageId)), createLore());
        const prefix = ids.filter((messageId) => messageId < cut).reduce((state, messageId) => recordLoreFired(state, record(messageId)), createLore());
        expect(rollbackLoreFired(all, cut)).toEqual(prefix);
        const rows = ids.map((messageId, index) => ({ messageId, level: levels[index % levels.length], smoothed: index / 40 }));
        const history = rows.reduce((acc: TensionHistoryRow[], row) => appendTensionHistory(acc, row), []);
        const replay = rows.filter((row) => row.messageId < cut).reduce((acc: TensionHistoryRow[], row) => appendTensionHistory(acc, row), []);
        expect(rollbackTensionHistory(history, cut)).toEqual(replay);
      }
    }
  });

  it("the rollback property fails when rollback keeps the cut message (control)", () => {
    const all = [3, 5].reduce((state, messageId) => recordLoreFired(state, record(messageId)), createLore());
    const inclusive = { fired: all.fired.filter((entry) => entry.messageId <= 5) };
    expect(inclusive).not.toEqual(rollbackLoreFired(all, 5));
  });

  it("caps, sanitizes and replaces a message's record", () => {
    let state = createLore();
    for (let messageId = 0; messageId < LORE_FIRED_LIMIT + 10; messageId += 1) state = recordLoreFired(state, record(messageId));
    expect(state.fired).toHaveLength(LORE_FIRED_LIMIT);
    expect(recordLoreFired(state, { messageId: LORE_FIRED_LIMIT + 9, entries: [] }).fired.at(-1)).toEqual({ messageId: LORE_FIRED_LIMIT + 9, entries: [] });
    expect(sanitizeLore({ fired: [record(1), { messageId: "x" }, { messageId: 2, entries: [{ book: "B", uid: 1, comment: "c", via: "bogus" }] }] })).toEqual({ fired: [record(1), { messageId: 2, entries: [] }] });
    expect(sanitizeLore(undefined)).toEqual(createLore());
    expect(sanitizeTension({ levels: [], smoothed: null, history: [{ messageId: 1, level: "tense", smoothed: 0.2 }, { messageId: 2, level: "loud", smoothed: 1 } as never] }).history).toHaveLength(1);
    expect(Array.from({ length: TENSION_HISTORY_LIMIT + 5 }, (_, index) => index).reduce((acc: TensionHistoryRow[], messageId) => appendTensionHistory(acc, { messageId, level: "calm", smoothed: 0 }), [])).toHaveLength(TENSION_HISTORY_LIMIT);
  });

  it("records only a rendered loud generation, tagging forced, mirror, constant and gated entries", () => {
    const slot: LoreSlot = {
      chatId: "c", epoch: 1, revision: 0, type: null, openedAt: "a", closedAt: "b", rendered: true, lastMessageId: 9,
      scans: [{ tag: "normal", loud: true, entries: [
        { world: "Book", uid: 1, comment: "Forced", constant: false, key0: null },
        { world: "Mirror", uid: 2, comment: "so_fact", constant: false, key0: null },
        { world: "Book", uid: 3, comment: "Always", constant: true, key0: null },
        { world: "Book", uid: 4, comment: "Keyed", constant: false, key0: "k" },
      ] }],
      forced: [{ world: "Book", uid: 1, comment: "Forced" }], landed: [], lost: [], constantMissed: [],
    };
    expect(loreFiredRecord(slot, null, "Mirror")?.entries.map((entry) => entry.via)).toEqual(["forced", "mirror", "constant", "key"]);
    expect(loreFiredRecord({ ...slot, rendered: false }, null, null)).toBeNull();
    expect(loreFiredRecord({ ...slot, scans: [{ ...slot.scans[0], loud: false }] }, null, null)).toBeNull();
  });

  it("an arc resolved at a message reopens when that message is rolled back (G3)", () => {
    const opened = applyArcSignals([], [{ kind: "open", text: "Who burned the archive at the edge of town?" }], { boundary: 1, messageId: 2 }).arcs;
    const resolved = applyArcSignals(opened, [{ kind: "resolved", text: "Who burned the archive at the edge of town?" }], { boundary: 1, messageId: 6 }).arcs;
    expect(resolved[0]).toMatchObject({ status: "resolved", resolvedMessageId: 6 });
    expect(rollbackArcs(resolved, 6, 1)[0]).toMatchObject({ status: "open" });
    expect(rollbackArcs(resolved, 6, 1)[0].resolvedMessageId).toBeUndefined();
    expect(rollbackArcs(resolved, 7, 1)[0]).toMatchObject({ status: "resolved" });
  });
});
