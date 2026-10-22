import { candidateKey, ConsumptionLedger, rowIneligible, writeMismatch, type LedgerEvent, type PolishRow } from "./ledger";

const hash = (row: PolishRow) => String(row.mes);
const row = (): PolishRow => ({ name: "Mara", mes: "*Mara smirks.*", send_date: "t3", swipe_id: 0 });

const open = (ledger = new ConsumptionLedger(), at = 1000) => {
  const target = row();
  const candidate = ledger.start(candidateKey(target, "chat-a", 3, hash), 1, at, 45000);
  return { ledger, target, candidate };
};

describe("v2.9 plan 03 S0: consumption ledger", () => {
  it.each<[string, LedgerEvent]>([
    ["generation-started", { kind: "generation-started", chatId: "chat-a" }],
    ["player-sent", { kind: "player-sent" }],
    ["chat-changed", { kind: "chat-changed" }],
    ["row-mutated", { kind: "mutation", id: 3 }],
    ["row-mutated", { kind: "mutation", id: 1 }],
    ["row-mutated", { kind: "mutation", id: null }],
    ["generation-stopped", { kind: "generation-stopped", lastId: 3 }],
    ["deadline", { kind: "tick", now: 46000 }],
    ["story-updated", { kind: "story-updated" }],
  ])("abandons on %s", (reason, event) => {
    const { ledger, candidate } = open();
    expect(ledger.observe(event)).toEqual([candidate]);
    expect(candidate.abandoned).toBe(reason);
  });

  it.each<[string, LedgerEvent]>([
    ["a dry run", { kind: "generation-started", chatId: "chat-a", dryRun: true }],
    ["another chat's generation", { kind: "generation-started", chatId: "chat-b" }],
    ["a later row's mutation", { kind: "mutation", id: 4 }],
    ["another row stopped", { kind: "generation-stopped", lastId: 5 }],
    ["a tick before the deadline", { kind: "tick", now: 45999 }],
  ])("keeps the candidate live through %s", (_label, event) => {
    const { ledger, candidate } = open();
    expect(ledger.observe(event)).toEqual([]);
    expect(candidate.abandoned).toBeNull();
  });

  it("is idempotent per reply revision: the same row opens the same candidate, a new swipe a new one", () => {
    const { ledger, target, candidate } = open();
    expect(ledger.start(candidateKey(target, "chat-a", 3, hash), 1, 2000, 45000)).toBe(candidate);
    const swiped = { ...target, swipe_id: 1, mes: "*Mara shrugs.*" };
    expect(ledger.start(candidateKey(swiped, "chat-a", 3, hash), 1, 2000, 45000)).not.toBe(candidate);
  });

  it("refuses the write when the row is another object, another swipe, changed text or past the deadline", () => {
    const { target, candidate } = open();
    expect(writeMismatch(candidate, { row: target, sameObject: true, chatId: "chat-a" }, hash, 2000)).toBeNull();
    expect(writeMismatch(candidate, { row: target, sameObject: false, chatId: "chat-a" }, hash, 2000)).toBe("write-mismatch");
    expect(writeMismatch(candidate, { row: { ...target, swipe_id: 1 }, sameObject: true, chatId: "chat-a" }, hash, 2000)).toBe("write-mismatch");
    expect(writeMismatch(candidate, { row: { ...target, mes: "edited" }, sameObject: true, chatId: "chat-a" }, hash, 2000)).toBe("write-mismatch");
    expect(writeMismatch(candidate, { row: target, sameObject: true, chatId: "chat-b" }, hash, 2000)).toBe("write-mismatch");
    expect(writeMismatch(candidate, { row: target, sameObject: true, chatId: "chat-a" }, hash, 46000)).toBe("deadline");
  });
});

describe("v2.9 plan 03: rows never eligible in v1", () => {
  it.each<[string, PolishRow | null, unknown, boolean]>([
    ["player-row", { mes: "Hi", is_user: true }, "normal", false],
    ["system-row", { mes: "Note", is_system: true }, "normal", false],
    ["impersonate", { mes: "Hi" }, "impersonate", false],
    ["scripted", { mes: "Authored line." }, "command", false],
    ["stopped", { mes: "Half a rep" }, "normal", true],
    ["thought-only", { mes: "  " }, "normal", false],
    ["no-row", null, "normal", false],
  ])("%s", (reason, target, type, stopped) => {
    expect(rowIneligible(target, type, stopped)).toBe(reason);
  });

  it("a normal, swipe or continue reply is eligible", () => {
    for (const type of ["normal", "swipe", "continue", undefined]) expect(rowIneligible({ mes: "*Mara smirks.*" }, type, false)).toBeNull();
  });
});
