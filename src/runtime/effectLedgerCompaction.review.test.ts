import { appendRow, compactLedger, restorePlan, rowsAfter, setStatus } from "./effectLedger";
import type { EffectLedgerRow, EffectTarget } from "./types";

let ids = 0;
const row = (target: EffectTarget, before: Record<string, unknown> | null, after: Record<string, unknown> | null, messageId: number, status: EffectLedgerRow["status"] = "applied", effect = target.kind): EffectLedgerRow => {
  ids += 1;
  return { id: `r${ids}`, effect, target, before, after, checkpointId: null, boundary: messageId, messageId, at: "2026-10-01T00:00:00.000Z", status };
};

const cast = (member: string): EffectTarget => ({ kind: "cast", group: "g", member });
const AN: EffectTarget = { kind: "an" };
const BG: EffectTarget = { kind: "background" };

const key = (target: EffectTarget) => JSON.stringify(target);

const hostAfter = (rows: EffectLedgerRow[], start: Map<string, Record<string, unknown> | null>) => {
  const host = new Map(start);
  for (const entry of rows) if (entry.status === "applied") host.set(key(entry.target), entry.after);
  return host;
};

const undo = (rows: EffectLedgerRow[], host: Map<string, Record<string, unknown> | null>) => {
  const next = new Map(host);
  const plan = restorePlan(rows, { read: (target) => next.get(key(target)) ?? null });
  for (const step of plan.steps) next.set(key(step.row.target), step.restoreTo);
  return Object.fromEntries([...next.entries()].sort());
};

describe("AS-10: the effect ledger compacts repeated writes per target", () => {
  it("drops an applied write that changed nothing, and merges chained writes on one target at one message (a round trip within one message is nothing)", () => {
    const rows = [
      row(AN, { text: "a" }, { text: "b" }, 3),
      row(AN, { text: "b" }, { text: "b" }, 3),
      row(BG, { name: "x.jpg" }, { name: "x.jpg" }, 3),
      row(cast("Mara"), { disabled: false }, { disabled: true }, 3),
      row(cast("Mara"), { disabled: true }, { disabled: false }, 3),
      row(cast("Mara"), { disabled: false }, { disabled: true }, 5),
    ];
    const compacted = compactLedger(rows);
    expect(compacted.map((entry) => [entry.target.kind, entry.before, entry.after, entry.messageId])).toEqual([
      ["an", { text: "a" }, { text: "b" }, 3],
      ["cast", { disabled: false }, { disabled: true }, 5],
    ]);
  });

  it("never merges across messages, across a broken chain, or a row that still owes a decision", () => {
    const rows = [
      row(AN, { text: "a" }, { text: "b" }, 3),
      row(AN, { text: "z" }, { text: "c" }, 3),
      row(AN, { text: "c" }, { text: "d" }, 4),
      row(AN, { text: "d" }, { text: "e" }, 4, "pending"),
      row(AN, { text: "e" }, { text: "e" }, 4, "failed"),
    ];
    expect(compactLedger(rows)).toHaveLength(5);
  });

  it("a restore on leave and a rollback from every message land the host where the uncompacted ledger would (4 seeds x 300 writes)", () => {
    const targets = [cast("Mara"), cast("Finn"), AN, BG];
    for (const seed of [1, 2, 3, 4]) {
      let state = seed;
      const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
      const start = new Map(targets.map((target) => [key(target), target.kind === "cast" ? { disabled: false } : target.kind === "an" ? { text: "t0" } : { name: "b0.jpg" }] as const));
      const host = new Map<string, Record<string, unknown> | null>(start);
      let rows: EffectLedgerRow[] = [];
      let message = 0;
      for (let index = 0; index < 300; index += 1) {
        if (random() < 0.3) message += 1;
        const target = targets[Math.floor(random() * targets.length)];
        const before = host.get(key(target)) ?? null;
        const after = target.kind === "cast" ? { disabled: random() < 0.5 } : target.kind === "an" ? { text: `t${Math.floor(random() * 3)}` } : { name: `b${Math.floor(random() * 3)}.jpg` };
        const status: EffectLedgerRow["status"] = random() < 0.9 ? "applied" : "failed";
        rows = [...rows, row(target, before, after, message, status)];
        if (status === "applied") host.set(key(target), after);
      }
      const compacted = compactLedger(rows);
      const live = hostAfter(rows, start);
      expect(Object.fromEntries([...hostAfter(compacted, start).entries()].sort())).toEqual(Object.fromEntries([...live.entries()].sort()));
      expect(undo(compacted, live)).toEqual(undo(rows, live));
      for (let cut = 0; cut <= message + 1; cut += 1) expect(undo(rowsAfter(compacted, cut), live)).toEqual(undo(rowsAfter(rows, cut), live));
      expect(compacted.length).toBeLessThan(rows.length);
    }
  });

  it("measures the serialized ledger over a long cast-heavy run: re-applied staging no longer grows it", () => {
    const write = (ledger: EffectLedgerRow[], entry: EffectLedgerRow) => setStatus(appendRow(ledger, { ...entry, status: "pending" }), entry.id, "applied");
    const naive: EffectLedgerRow[] = [];
    let ledger: EffectLedgerRow[] = [];
    const host = new Map<string, Record<string, unknown>>();
    const members = Array.from({ length: 40 }, (_, index) => `Member ${index}`);
    let changes = 0;
    for (let boundary = 0; boundary < 400; boundary += 1) {
      for (let pass = 0; pass < 3; pass += 1) {
        const writes: Array<[EffectTarget, Record<string, unknown>]> = [
          [AN, { text: `scene ${Math.floor(boundary / 10)}` }],
          [BG, { name: `bg${Math.floor(boundary / 20)}.jpg` }],
          ...(boundary % 25 === 0 && pass === 0 ? members.map((member, index): [EffectTarget, Record<string, unknown>] => [cast(member), { disabled: (index + boundary / 25) % 2 === 0 }]) : []),
        ];
        for (const [target, after] of writes) {
          const before = host.get(key(target)) ?? null;
          if (target.kind === "cast" && before && before.disabled === after.disabled) continue;
          const entry = row(target, before, after, boundary);
          naive.push(entry);
          ledger = write(ledger, entry);
          if (JSON.stringify(before) !== JSON.stringify(after)) changes += 1;
          host.set(key(target), after);
        }
      }
    }
    const size = JSON.stringify(ledger).length;
    const naiveSize = JSON.stringify(naive).length;
    expect(ledger.length).toBeLessThanOrEqual(changes + 1);
    expect(size).toBeLessThan(naiveSize / 2);
    expect(size).toBeLessThan(400_000);
  });
});
