import {
  applyEpistemicSignals,
  capEpistemic,
  dropCommonKnowledge,
  epistemicForSubject,
  removeEpistemic,
  renderPrivateEpistemicBlock,
  rollbackEpistemic,
  setEpistemicPinned,
} from "./epistemic";
import { parseEpistemicLine, parseEpistemicRetire } from "./parse";
import type { EpistemicEntry, ParsedEpistemicSignal } from "./types";

const ctx = (boundary: number, messageId?: number) => ({ boundary, messageId });
const sig = (tag: ParsedEpistemicSignal["tag"], subject: string, content: string, hiddenFrom?: string): ParsedEpistemicSignal =>
  ({ tag, subject, content, ...(hiddenFrom ? { hiddenFrom } : {}) });

describe("parseEpistemicLine", () => {
  it("parses standard tags (Smart-Memory cases)", () => {
    expect(parseEpistemicLine("[knows] Kael | he took the gem")).toEqual({ tag: "knows", subject: "Kael", content: "he took the gem" });
    expect(parseEpistemicLine("[believes] Lyria | Kael did not notice anything was missing")).toEqual({
      tag: "believes",
      subject: "Lyria",
      content: "Kael did not notice anything was missing",
    });
  });

  it("parses the hiding pattern with a target", () => {
    expect(parseEpistemicLine("[hiding] Kael from Lyria | the theft")).toEqual({
      tag: "hiding",
      subject: "Kael",
      hiddenFrom: "Lyria",
      content: "the theft",
    });
  });

  it("rejects unknown tags and non-epistemic lines", () => {
    expect(parseEpistemicLine("[arc] some open thread | nope")).toBeNull();
    expect(parseEpistemicLine("NONE")).toBeNull();
    expect(parseEpistemicLine("[knows] Kael |   ")).toBeNull();
  });
});

describe("parseEpistemicRetire", () => {
  it("extracts retire indices", () => {
    expect(parseEpistemicRetire("[retire] 3")).toEqual([3]);
    expect(parseEpistemicRetire("[retire] 1 4")).toEqual([1, 4]);
    expect(parseEpistemicRetire("[knows] Kael | fact")).toEqual([]);
  });
});

describe("applyEpistemicSignals", () => {
  it("adds new entries with provenance", () => {
    const result = applyEpistemicSignals([], [sig("knows", "Kael", "he took the gem")], ctx(2, 9));
    expect(result.added).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ subject: "Kael", tag: "knows", content: "he took the gem", createdAt: 2, messageId: 9 });
  });

  it("dedups the same subject+tag+content", () => {
    const first = applyEpistemicSignals([], [sig("knows", "Kael", "he took the gem")], ctx(1));
    const second = applyEpistemicSignals(first.entries, [sig("knows", "kael", "he took the gem")], ctx(2));
    expect(second.added).toHaveLength(0);
  });

  it("keeps hiding entries distinct by target", () => {
    const first = applyEpistemicSignals([], [sig("hiding", "Kael", "the theft", "Lyria")], ctx(1));
    const second = applyEpistemicSignals(first.entries, [sig("hiding", "Kael", "the theft", "Fen")], ctx(2));
    expect(second.added).toHaveLength(1);
  });

  it("drops content below the minimum length", () => {
    const result = applyEpistemicSignals([], [sig("knows", "Kael", "x")], ctx(1));
    expect(result.added).toHaveLength(0);
  });

  it("retires entries by id and marks them superseded", () => {
    const opened = applyEpistemicSignals([], [sig("believes", "Lyria", "nothing was taken")], ctx(1));
    const target = opened.entries[0];
    const result = applyEpistemicSignals(opened.entries, [sig("knows", "Lyria", "Kael took the gem")], ctx(2), [target.id]);
    expect(result.retired).toHaveLength(1);
    expect(result.entries.find((entry) => entry.id === target.id)?.supersededBy).toContain("retired@2");
    expect(epistemicForSubject(result.entries, ["Lyria"]).map((entry) => entry.tag)).toEqual(["knows"]);
  });
});

describe("renderPrivateEpistemicBlock", () => {
  const build = (): EpistemicEntry[] => [
    ...applyEpistemicSignals([], [
      sig("knows", "Kael", "he took the gem"),
      sig("hiding", "Kael", "the theft", "Lyria"),
      sig("unaware", "Kael", "Lyria saw him"),
      sig("believes", "Lyria", "nothing was taken"),
    ], ctx(1)).entries,
  ];

  it("shows the subject's own knowledge and excludes unaware", () => {
    const block = renderPrivateEpistemicBlock(build(), ["Kael"]);
    expect(block).toContain("You know: he took the gem");
    expect(block).toContain("You are concealing from Lyria: the theft");
    expect(block).not.toContain("unaware");
    expect(block).not.toContain("Lyria saw him");
  });

  it("shows nothing about another character's private state", () => {
    const block = renderPrivateEpistemicBlock(build(), ["Kael"]);
    expect(block).not.toContain("nothing was taken");
  });

  it("returns empty when the subject has no active knowledge", () => {
    expect(renderPrivateEpistemicBlock(build(), ["Fen"])).toBe("");
  });
});

describe("epistemic maintenance ops", () => {
  it("rolls back entries at or after a message id but keeps pinned", () => {
    const state = applyEpistemicSignals([], [sig("knows", "Kael", "he took the gem")], ctx(3, 12)).entries;
    expect(rollbackEpistemic(state, 12)).toHaveLength(0);
    const pinned = setEpistemicPinned(state, state[0].id, true);
    expect(rollbackEpistemic(pinned, 12)).toHaveLength(1);
  });

  it("caps unpinned entries and removes by id", () => {
    let entries: EpistemicEntry[] = [];
    for (let i = 0; i < 5; i += 1) entries = applyEpistemicSignals(entries, [sig("knows", `C${i}`, `fact number ${i}`)], ctx(i)).entries;
    expect(capEpistemic(entries, 3)).toHaveLength(3);
    expect(removeEpistemic(entries, entries[0].id)).toHaveLength(4);
  });

  it("keeps each subject's newest entries under the per-subject cap, and never trims a pinned one", () => {
    let entries: EpistemicEntry[] = [];
    for (let i = 0; i < 5; i += 1) entries = applyEpistemicSignals(entries, [sig("knows", "Belle", `detail number ${i}`), sig("knows", "Dalan", `other detail ${i}`)], ctx(i)).entries;
    entries = setEpistemicPinned(entries, entries[0].id, true);
    const capped = capEpistemic(entries, 80, 2);
    expect(capped.filter((entry) => entry.subject === "Belle").map((entry) => entry.content)).toEqual(["detail number 0", "detail number 3", "detail number 4"]);
    expect(capped.filter((entry) => entry.subject === "Dalan").map((entry) => entry.content)).toEqual(["other detail 3", "other detail 4"]);
  });
});

describe("dropCommonKnowledge", () => {
  const present = ["Belle", "Dalan", "Tobias"];

  it("drops a [knows] fact three characters are all handed in one batch, whatever its punctuation", () => {
    const kept = dropCommonKnowledge([
      sig("knows", "Belle", "The mine collapsed on the miners."),
      sig("knows", "Dalan", "the mine collapsed on the miners"),
      sig("knows", "Max", "The mine collapsed, on the miners!"),
      sig("knows", "Belle", "Ilsa hid the map in the chapel"),
    ], present);
    expect(kept).toEqual([sig("knows", "Belle", "Ilsa hid the map in the chapel")]);
  });

  it("drops a fact every character present knows, even when only two are present", () => {
    expect(dropCommonKnowledge([sig("knows", "Belle", "The gate is open"), sig("knows", "Dalan", "The gate is open")], ["Belle", "Dalan"])).toEqual([]);
    expect(dropCommonKnowledge([sig("knows", "Belle", "The gate is open"), sig("knows", "Dalan", "The gate is open")], present)).toHaveLength(2);
  });

  it("keeps shared knowledge that the batch marks someone as missing, and never touches other tags", () => {
    const signals = [
      sig("knows", "Belle", "The steward lied"),
      sig("knows", "Dalan", "The steward lied"),
      sig("knows", "Max", "The steward lied"),
      sig("unaware", "Tobias", "the steward lied"),
      sig("suspects", "Belle", "Dalan is hurt"),
      sig("suspects", "Dalan", "Dalan is hurt"),
      sig("suspects", "Tobias", "Dalan is hurt"),
    ];
    expect(dropCommonKnowledge(signals, present)).toEqual(signals);
  });
});
