import { sanitizeMemory } from "./extras";
import type { RuntimeExtras } from "./types";

const envelope = { source: "code", validity: "live", messageId: 4, boundary: 2, pass: "chapterSeal" };

const record = (extra: Record<string, unknown> = {}) => ({
  id: "arrival#1", chapterId: "arrival", part: 1, title: "Arrival", playerTitle: "Arrival", range: { from: 0, to: 4 }, boundaries: { from: 0, to: 2 },
  checkpoints: ["gate"], summary: "They arrived.", short: "Arrived.", consequences: [], people: [{ rosterId: "mara", name: "Mara", text: "led" }],
  open: [{ arcId: "a1", text: "the debt", disposition: "carry" }], blackboardDelta: {}, blackboardAt: {}, status: "sealed", provenance: envelope,
  tokens: { summary: 3, short: 1 }, sealedAt: { boundary: 2, messageId: 4, at: 0, pathLength: 2 }, ...extra,
});

const beat = (extra: Record<string, unknown> = {}) => ({ chatId: "c", memberId: "mara", basedOnMessageId: 3, checkpointId: "gate", beat: "wary", at: "t", ...extra });

const hydrate = (memory: Record<string, unknown>) => sanitizeMemory({ memory: { entries: [], ...memory } } as unknown as RuntimeExtras);

describe("CR-E10: chapter records, inner beats and the skip mark are deep-validated on read", () => {
  it("drops malformed rows instead of throwing, and keeps the valid ones", () => {
    const garbage = [null, 7, "x", [], { id: "only" }, record({ people: "nope" }), record({ open: [{ arcId: 1 }] }), record({ boundaries: null }),
      record({ sealedAt: { boundary: 2, messageId: 4, at: 0 } }), record({ playerTitle: 9 }), record({ range: { from: "0", to: 4 } })];
    let memory: ReturnType<typeof sanitizeMemory> | null = null;
    expect(() => { memory = hydrate({ chapters: [...garbage, record()], innerBeats: [null, 3, beat({ beat: 4 }), beat({ basedOnMessageId: "3" }), beat()] }); }).not.toThrow();
    expect(memory!.chapters).toEqual([record()]);
    expect(memory!.innerBeats).toEqual([beat()]);
  });

  it("defaults the optional parts of a record and drops a bridge or recap mark of the wrong shape", () => {
    const { people: _people, open: _open, playerTitle: _title, ...bare } = record();
    const memory = hydrate({ chapters: [{ ...bare, bridge: { text: 5 }, recapSeenAt: "no" }, { ...record({ id: "arrival#2", part: 2 }), bridge: { text: "b", committedAt: 6 }, recapSeenAt: 7 }] });
    expect(memory.chapters?.[0]).toMatchObject({ people: [], open: [], playerTitle: "Arrival" });
    expect(memory.chapters?.[0]).not.toHaveProperty("bridge");
    expect(memory.chapters?.[0]).not.toHaveProperty("recapSeenAt");
    expect(memory.chapters?.[1]).toMatchObject({ bridge: { text: "b", committedAt: 6 }, recapSeenAt: 7 });
  });

  it("keeps a skip chain only as far as it is well formed", () => {
    const memory = hydrate({ chapterSealSkip: { pathLength: 4, messageId: 9, previous: { pathLength: 2, messageId: "x", previous: { pathLength: 1, messageId: 1 } } } });
    expect(memory.chapterSealSkip).toEqual({ pathLength: 4, messageId: 9, previous: null });
    expect(hydrate({ chapterSealSkip: "garbage" }).chapterSealSkip).toBeNull();
  });
});
