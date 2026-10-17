import { storedReadRecord, storedReads, type StoredRead } from "./storedReads";

const reads: StoredRead[] = [{ i: 1, who: "Mara", face: "joy", src: "llm", at: "k1" }];
const owner = { text: "Mara laughs.", swipeId: 0 };

describe("plan 69 K13: stored expression picks are bound to the reply revision", () => {
  it("control: the same text and swipe read the picks back", () => {
    expect(storedReads(storedReadRecord(reads, owner), owner)).toEqual(reads);
  });

  it("an in-place swipe makes the picks invalid", () => {
    expect(storedReads(storedReadRecord(reads, owner), { ...owner, swipeId: 1 })).toEqual([]);
  });

  it("an in-place edit makes the picks invalid", () => {
    expect(storedReads(storedReadRecord(reads, owner), { ...owner, text: "Mara frowns." })).toEqual([]);
  });
});
