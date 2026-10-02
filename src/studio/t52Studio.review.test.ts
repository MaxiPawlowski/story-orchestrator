import type { StoryV2 } from "@engine/index";
import { wizardSessionKey } from "@wizard/index";
import { isCompoundHouseRule } from "./authoringDiagnostics";
import { runDiagnostics } from "./diagnostics";
import { newStoryDraft, useDraftStore } from "./draft";
import { setRequirements } from "./mutations";

const pawnbroker = (members: string[]): StoryV2 => ({
  format: 2,
  title: "The Pawnbroker of Forgotten Days",
  description: "",
  qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "clerk", name: "Ivet Marrow" }, { id: "thief", name: "Sera Vantel" }, { id: "narrator" }],
  requirements: { members },
});

const rosterIdRows = (draft: StoryV2) => runDiagnostics(draft).filter((entry) => entry.code === "requirement-member-roster-id");

describe("T5-2 HIGH: Diagnostics names a requirement written as a roster id", () => {
  it("warns for each member that is a cast id whose card has another name (wizard-drafts.json:2486)", () => {
    const rows = rosterIdRows(pawnbroker(["clerk", "thief"]));
    expect(rows.map((row) => [row.path, row.severity])).toEqual([["requirements.members.0", "warning"], ["requirements.members.1", "warning"]]);
    expect(rows[0].message).toContain("require 'Ivet Marrow'");
    expect(rows[0].consequence).toContain("never reads as ready");
  });

  it("control: card names, an unnamed member's id, and a name no roster member holds are not flagged", () => {
    expect(rosterIdRows(pawnbroker(["Ivet Marrow", "sera vantel", "narrator", "Osric Vane"]))).toEqual([]);
  });
});

const T52_RULES = [
  "The poor pay in recollections; the rich pay in coin.",
  "The poor pay in recollections and the rich pay in coin; a memory debt is legally binding and enforced by the Memory Guild.",
  "The Memory Guild licenses all pawnbrokers and holds sealed writs; its authority over debts and memories is absolute and its attention is dangerous.",
  "Memory is currency: years of a life can be pawned, sold, or seized to settle a debt, and every such transaction leaves a record in the ledger.",
  "The queen's first twenty years are genuinely gone from her — she recalls nothing of them, and no one may simply tell her what they contained.",
  "Every pawned memory is recorded in a ledger entry that names the debt, the term, and the holder.",
  "The poor pay debts in recollections and the rich pay in coin; a memory taken as payment is gone from the payer for as long as the debt stands.",
];

describe("T5-2 LOW: house-rule-compound flags two demands, not one world fact with a contrast", () => {
  it.each(T52_RULES)("a one-fact world rule is not compound: %s", (rule) => {
    expect(isCompoundHouseRule(rule)).toBe(false);
  });

  it.each(["No guns; no swords.", "Never break character and always write in second person.", "Keep replies short and never speak for the player."])("two demands are still flagged: %s", (rule) => {
    expect(isCompoundHouseRule(rule)).toBe(true);
  });

  it("the diagnostic follows the narrowed check", () => {
    const draft: StoryV2 = { ...pawnbroker([]), house_rules: [...T52_RULES, "No guns; no swords."] };
    expect(runDiagnostics(draft).filter((entry) => entry.code === "house-rule-compound").map((entry) => entry.path)).toEqual([`house_rules.${T52_RULES.length}`]);
  });
});

describe("T5-2 MEDIUM: a draft has its own key, so the agent session of one draft is never another's", () => {
  it("mints a new key for every new draft, even when both are untitled", () => {
    useDraftStore.getState().newDraft();
    const first = useDraftStore.getState().draftKey;
    useDraftStore.getState().newDraft();
    const second = useDraftStore.getState().draftKey;
    expect(first).not.toBe(second);
    expect(first).not.toBe(wizardSessionKey({ title: newStoryDraft().title }));
  });

  it("keys a library story by its id, and keeps the key through a save that assigns one", () => {
    useDraftStore.getState().loadDraft({ ...newStoryDraft(), id: "the-pawnbroker" });
    expect(useDraftStore.getState().draftKey).toBe(wizardSessionKey({ id: "the-pawnbroker" }));
    useDraftStore.getState().newDraft();
    const key = useDraftStore.getState().draftKey;
    useDraftStore.getState().loadDraft({ ...newStoryDraft(), id: "saved-now", version: 1 }, "hash", key);
    expect(useDraftStore.getState().draftKey).toBe(key);
  });
});

describe("T5-2 LOW: Undo is a change a running agent has to notice", () => {
  it("bumps the run epoch and leaves one note naming what changed, taken once", () => {
    useDraftStore.getState().newDraft();
    useDraftStore.getState().mutate((draft) => setRequirements(draft, { lorebooks: ["The Pawnbroker of Forgotten Days"] }));
    const epoch = useDraftStore.getState().runEpoch;
    useDraftStore.getState().undo();
    expect(useDraftStore.getState().runEpoch).toBe(epoch + 1);
    const notes = useDraftStore.getState().takeUndone();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("pressed Undo, which changed requirements");
    expect(useDraftStore.getState().takeUndone()).toEqual([]);
  });

  it("control: an ordinary edit leaves the epoch and the notes alone", () => {
    useDraftStore.getState().newDraft();
    const epoch = useDraftStore.getState().runEpoch;
    useDraftStore.getState().mutate((draft) => setRequirements(draft, { members: ["Ivet Marrow"] }));
    expect(useDraftStore.getState().runEpoch).toBe(epoch);
    expect(useDraftStore.getState().takeUndone()).toEqual([]);
  });
});
