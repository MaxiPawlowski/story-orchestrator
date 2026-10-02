import { castMemberNames, isValidationErrorList, parseStoryV2, type StoryV2 } from "@engine/index";
import { runDiagnostics } from "./diagnostics";
import { rosterMemberIsPlayer } from "./playerRole";
import { placeOf, SCHEMA_FALLBACK, schemaConsequence } from "./schemaErrors";
import { useDraftStore, type StoryDraft } from "./draft";

const redline = (): StoryV2 => ({
  format: 2,
  title: "The Redline Kingdom",
  description: "A cartographer's apprentice learns the map she inks redraws the kingdom.",
  qualities: [{ key: "ink", type: "int", source: "extractor", rubric: "How much does she understand?" }],
  checkpoints: [
    { id: "start", name: "The Ink That Moves", objective: "Notice.", type: "anchor", start: true, effects: { cast_changes: { disable: ["lord_vael", "nobody"] } } },
    { id: "redline", name: "The Redline", objective: "Choose.", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "redline", priority: 0, gate: { q: "ink", op: ">=", v: 1 } }],
  roster: [
    { id: "player", name: "The Apprentice", role: "player persona — the cartographer's apprentice" },
    { id: "master_ilse", name: "Master Ilse" },
    { id: "lord_vael", name: "Lord Vael" },
  ],
});

describe("T5-3 HIGH: a cast change written with roster ids reads as the members it names", () => {
  it("resolves the ids the Studio shows as ticked members", () => {
    expect(castMemberNames(redline().roster, ["lord_vael", "Master Ilse", "nobody"])).toEqual(["Lord Vael", "Master Ilse", "nobody"]);
  });

  it("warns about an entry that is neither a cast name nor a cast id, and only about it", () => {
    const found = runDiagnostics(redline()).filter((entry) => entry.code === "cast-change-unknown-member");
    expect(found.map((entry) => [entry.path, entry.message])).toEqual([
      ["checkpoints.0.effects.cast_changes.disable.1", "'nobody' is not in the cast: no cast member has that name or id"],
    ]);
    expect(found[0].consequence).toMatch(/switches nobody on or off/);
  });

  it("checks the card of a roster id by the member's card name", () => {
    const found = runDiagnostics(redline(), { characterNames: () => ["Master Ilse", "Lord Vael"] }).filter((entry) => entry.code === "cast-member-no-card");
    expect(found.map((entry) => entry.message)).toEqual(["no card named 'nobody' on this install; create it, or use the card's exact name"]);
  });
});

describe("T5-3 LOW: the player is never offered as a cast member", () => {
  it("recognises a roster entry marked as the player", () => {
    const draft = redline();
    expect(draft.roster.filter((member) => rosterMemberIsPlayer(member, draft)).map((member) => member.id)).toEqual(["player"]);
  });

  it("flags it in diagnostics", () => {
    expect(runDiagnostics(redline()).filter((entry) => entry.code === "roster-member-is-player").map((entry) => entry.path)).toEqual(["roster.0"]);
  });
});

describe("T5-3 MEDIUM: a blocking schema error says what it costs and names the checkpoint", () => {
  const looped = (): StoryV2 => {
    const draft = redline();
    draft.checkpoints = [
      { id: "start", name: "The Ink That Moves", objective: "Notice.", type: "intermediate", start: true },
      { id: "first_house", name: "The First Approach", objective: "Meet Vael.", type: "intermediate" },
      { id: "redline", name: "The Redline", objective: "Choose.", type: "anchor" },
    ];
    draft.transitions = [
      { from: "start", to: "first_house", priority: 0, gate: { q: "ink", op: ">=", v: 1 } },
      { from: "first_house", to: "start", priority: 0, gate: { q: "ink", op: ">=", v: 2 } },
    ];
    return draft;
  };

  it("maps the error path to the checkpoint's name and gives a consequence", () => {
    const parsed = parseStoryV2(looped());
    if (!isValidationErrorList(parsed)) throw new Error("expected a schema error");
    const reachable = parsed.find((error) => /no reachable anchor/.test(error.message));
    expect(reachable).toBeDefined();
    expect(placeOf(looped(), reachable?.path ?? "")).toMatch(/^Checkpoint "The (Ink That Moves|First Approach)"$/);
    expect(schemaConsequence(reachable?.message ?? "")).toMatch(/can never reach a turning point after it/);
  });

  it("names a transition by its checkpoints, and falls back to a plain consequence", () => {
    expect(placeOf(looped(), "transitions.1.to")).toBe("Transition The First Approach → The Ink That Moves · to");
    expect(schemaConsequence("something new went wrong")).toBe(SCHEMA_FALLBACK);
    expect(placeOf(looped(), "title")).toBe("title");
  });
});

describe("T5-3 LOW: saving keeps the checkpoint the author was editing", () => {
  it("keeps the selection when asked, and still resets it on a plain load", () => {
    const draft = redline() as StoryDraft;
    useDraftStore.getState().loadDraft(draft);
    useDraftStore.getState().selectCheckpoint("redline");
    useDraftStore.getState().loadDraft({ ...draft, version: 2 }, "h2", undefined, { keepSelection: true });
    expect(useDraftStore.getState().selectedCheckpointId).toBe("redline");
    useDraftStore.getState().loadDraft(draft);
    expect(useDraftStore.getState().selectedCheckpointId).toBe("start");
  });
});
