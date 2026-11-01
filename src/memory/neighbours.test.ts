import { addMemoryEntries, dropByMessageId } from "./stores";
import { neighbourSet, resolveNeighbour, selectNeighbours, NEIGHBOUR_LIMIT } from "./neighbours";
import { provenance } from "./provenance";
import type { MemoryEntry, MemoryStoreState } from "./types";
import { runProbeSession, PROBE_CAST } from "../../test/support/memoryProbes";

const row = (id: string, text: string, messageId: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text, type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: text,
  createdAt: messageId, messageId, recallCount: 0, provenance: provenance({ source: "extractor", messageId, boundary: messageId, pass: "shared-read" }), ...extra,
});

const store = (entries: MemoryEntry[]): MemoryStoreState => ({ entries, excluded: [], writeLog: [] });

const dog = row("dog", "Mira keeps a grey dog called Ash.", 2, { entities: ["Mira", "Ash"] });
const key = row("key", "Tobin keeps the cellar key in the pantry.", 3, { entities: ["Tobin"] });
const locked = row("oath", "Esk swore never to cross the river.", 4, { entities: ["Esk"], locked: true });

describe("v3.0 43 M1: neighbour-aware read (same= / update=)", () => {
  test("lists only standing facts/session rows whose entity or key the window names, newest-strongest first, capped", () => {
    const superseded = row("old", "Mira kept a cat.", 1, { entities: ["Mira"], supersededBy: "dog" });
    const archived = row("arch", "Mira once lived by the mill.", 1, { entities: ["Mira"], foldedInto: "archive:evicted" });
    const summary = row("st", "Recently Mira talked.", 1, { entities: ["Mira"], tier: "short_term" });
    const keyed = row("keyed", "A brass compass sits on the shelf.", 5, { keys: ["compass"] });
    const picked = selectNeighbours([dog, key, superseded, archived, summary, keyed, locked], "Mira: Where did the compass go?");
    expect(picked.map((entry) => entry.id)).toEqual(["keyed", "dog"]);
    const many = Array.from({ length: 20 }, (_, index) => row(`r${index}`, `Mira fact ${index}.`, index, { entities: ["Mira"] }));
    expect(selectNeighbours(many, "Mira waves.")).toHaveLength(NEIGHBOUR_LIMIT);
    expect(selectNeighbours([dog], "")).toEqual([]);
  });

  test("per-read aliases are stable and resolve back to stored ids; unknown aliases fall back to a new line", () => {
    const set = neighbourSet([dog, key]);
    expect(set?.rows.map((entry) => entry.alias)).toEqual(["m1", "m2"]);
    expect(set?.section).toContain("[m1] Mira keeps a grey dog called Ash.");
    expect(neighbourSet([dog, key])?.section).toBe(set?.section);
    expect(resolveNeighbour({ text: "x", neighbour: { kind: "update" as const, id: "m2" } }, set?.rows ?? null).line.neighbour).toEqual({ kind: "update", id: "key" });
    const unknown = resolveNeighbour({ text: "x", neighbour: { kind: "same" as const, id: "m9" } }, set?.rows ?? null);
    expect(unknown).toEqual({ line: { text: "x" }, unknown: true });
  });

  test("same= confirms the stored row and stores nothing; a covered re-read does not confirm twice", () => {
    const repeat = row("n1", "Mira has a grey dog, Ash.", 10, { entities: ["Mira"], neighbour: { kind: "same", id: "dog" } });
    const first = addMemoryEntries(store([dog, key]), [repeat], { from: 9, to: 10 });
    expect(first.accepted).toEqual([]);
    expect(first.state.entries).toHaveLength(2);
    expect(first.state.entries[0]).toMatchObject({ id: "dog", recallCount: 1, confirmedAt: [{ messageId: 10, boundary: 10 }] });
    const again = addMemoryEntries(first.state, [{ ...repeat, id: "n2" }], { from: 9, to: 10 });
    expect(again.state.entries[0].recallCount).toBe(1);
  });

  test("update= stores the new row and supersedes the old one at the read's message", () => {
    const moved = row("n3", "Tobin moved the cellar key to the attic.", 12, { entities: ["Tobin"], neighbour: { kind: "update", id: "key" } });
    const written = addMemoryEntries(store([dog, key]), [moved], { from: 11, to: 12 });
    expect(written.accepted.map((entry) => entry.id)).toEqual(["n3"]);
    expect(written.accepted[0].neighbour).toBeUndefined();
    expect(written.state.entries.find((entry) => entry.id === "key")).toMatchObject({ supersededBy: "n3", supersededAt: { messageId: 12, boundary: 12 } });
  });

  test("update= on a locked, author-decided or pinned row is a plain add; an unknown target is a plain add", () => {
    const decided = row("decided", "Tobin is the miller's son.", 5, { entities: ["Tobin"], provenance: { ...provenance({ source: "author", messageId: 5, boundary: 5, pass: "author" }) } });
    const pinned = row("pinned", "Mira fears deep water.", 6, { entities: ["Mira"], pinned: true });
    const lines = [
      row("u1", "Esk crossed the river after all.", 13, { neighbour: { kind: "update", id: "oath" } }),
      row("u2", "Tobin is not the miller's son.", 13, { neighbour: { kind: "update", id: "decided" } }),
      row("u3", "Mira learned to swim.", 13, { neighbour: { kind: "update", id: "pinned" } }),
      row("u4", "Someone new arrived.", 13, { neighbour: { kind: "update", id: "gone" } }),
    ];
    const written = addMemoryEntries(store([locked, decided, pinned]), lines, { from: 12, to: 13 });
    expect(written.accepted.map((entry) => entry.id)).toEqual(["u1", "u2", "u3", "u4"]);
    expect(written.state.entries.filter((entry) => entry.supersededBy)).toEqual([]);
  });

  test("rollback past the read restores the store exactly (link, count and the new row go)", () => {
    const before = store([dog, key]);
    const repeat = row("n4", "Mira's dog is Ash.", 20, { neighbour: { kind: "same", id: "dog" } });
    const moved = row("n5", "Tobin hid the cellar key under the stairs.", 20, { neighbour: { kind: "update", id: "key" } });
    const written = addMemoryEntries(before, [repeat, moved], { from: 19, to: 20 });
    const rolled = dropByMessageId(written.state, 20);
    expect(rolled.entries.map(({ confirmedAt: _c, ...entry }) => entry)).toEqual(before.entries);
    expect(rolled.entries.every((entry) => !entry.confirmedAt?.length && !entry.supersededBy)).toBe(true);
  });

  test("F-M1c: a held-secret row is never listed for the read (resting filter of a real coordinator)", async () => {
    let listed: MemoryEntry[] = [];
    await runProbeSession({
      boundaries: 14,
      after: (session) => {
        const resting = session.coordinator.injector.restingEntries(session.memory().entries);
        listed = [...listed, ...selectNeighbours(resting, PROBE_CAST.map((member) => member.name).join(" "), 200)];
      },
    });
    const secrets = ["forged the toll receipts", "poisoned the cistern", "bribed the magistrate", "stole the relic"];
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((entry) => secrets.some((secret) => entry.text.includes(secret)))).toEqual([]);
  }, 60000);
});
