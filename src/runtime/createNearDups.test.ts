import type { CuratorEntryView } from "@stagecraft/index";
import { createNearDups } from "./createNearDups";
import type { VectorHost } from "./hostPorts";

const entry = (comment: string, uid: number): CuratorEntryView => ({ lorebook: "Story Lore", comment, keys: [comment.toLowerCase()], content: `${comment} text.`, disabled: false, uid });
const entries = [entry("The Warden", 0), entry("The Harbor", 1), entry("The Delta", 2)];
const subject = { comment: "Warden Hale", keys: ["Hale"], content: "Runs the prison." };

const fakeHost = (state: "present" | "absent" | "error", answer: (threshold: number) => number[], fail = false) => {
  const calls = { insert: 0, purge: 0, query: [] as number[] };
  const host = {
    source: "transformers",
    capabilityState: async () => state,
    vectorInsert: async () => { calls.insert += 1; if (fail) throw new Error("vectors down"); },
    vectorQuery: async (_id: string, _text: string, _top: number, threshold: number) => { calls.query.push(threshold); return answer(threshold).map((index) => ({ index })); },
    vectorPurge: async () => { calls.purge += 1; },
  } as unknown as VectorHost;
  return { host, calls };
};

describe("v2.8 A15: the create card's vector near-duplicate read", () => {
  it("asks both consolidation bands and maps each candidate's matches", async () => {
    const { host, calls } = fakeHost("present", (threshold) => (threshold >= 0.82 ? [0] : [0, 1]));
    expect(await createNearDups(host, [subject], entries)).toEqual([[
      { comment: "The Warden", score: 0.82, band: "duplicate", via: "vectors" },
      { comment: "The Harbor", score: 0.55, band: "same-topic", via: "vectors" },
    ]]);
    expect(calls.query).toEqual([0.82, 0.55]);
    expect(calls).toMatchObject({ insert: 1, purge: 1 });
  });

  it("answers null without touching the vectors API when the install has none", async () => {
    const { host, calls } = fakeHost("absent", () => []);
    expect(await createNearDups(host, [subject], entries)).toBeNull();
    expect(calls).toMatchObject({ insert: 0, purge: 0 });
  });

  it("answers null on a vectors error and still purges its collection", async () => {
    const { host, calls } = fakeHost("present", () => [], true);
    expect(await createNearDups(host, [subject], entries)).toBeNull();
    expect(calls.purge).toBe(1);
  });

  it("asks nothing for an empty card list or an empty book", async () => {
    const { host, calls } = fakeHost("present", () => [0]);
    expect(await createNearDups(host, [], entries)).toBeNull();
    expect(await createNearDups(host, [subject], [])).toBeNull();
    expect(calls.insert).toBe(0);
  });
});
