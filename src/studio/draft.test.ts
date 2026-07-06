import { resetDraftStore, useDraftStore, type StoryDraft } from "./draft";
import { addCheckpoint, addQuality, removeCheckpoint, setStoryField } from "./mutations";

const load = (draft: StoryDraft) => useDraftStore.getState().loadDraft(draft);

describe("draft store", () => {
  beforeEach(() => resetDraftStore());

  it("starts clean and valid", () => {
    const state = useDraftStore.getState();
    expect(state.dirty).toBe(false);
    expect(state.errors).toHaveLength(0);
    expect(state.past).toHaveLength(0);
  });

  it("mutate pushes history and marks dirty", () => {
    useDraftStore.getState().mutate((draft) => setStoryField(draft, "title", "Edited"));
    const state = useDraftStore.getState();
    expect(state.draft.title).toBe("Edited");
    expect(state.dirty).toBe(true);
    expect(state.past).toHaveLength(1);
  });

  it("undo and redo move across history", () => {
    const store = useDraftStore.getState();
    store.mutate((draft) => setStoryField(draft, "title", "One"));
    store.mutate((draft) => setStoryField(draft, "title", "Two"));
    useDraftStore.getState().undo();
    expect(useDraftStore.getState().draft.title).toBe("One");
    useDraftStore.getState().redo();
    expect(useDraftStore.getState().draft.title).toBe("Two");
  });

  it("reset returns to the loaded baseline", () => {
    useDraftStore.getState().mutate((draft) => setStoryField(draft, "title", "Edited"));
    useDraftStore.getState().reset();
    const state = useDraftStore.getState();
    expect(state.dirty).toBe(false);
    expect(state.draft.title).toBe("Untitled Story");
  });

  it("recomputes validation errors on mutation", () => {
    load({
      format: 2,
      title: "S",
      description: "",
      qualities: [],
      checkpoints: [{ id: "start", name: "Start", objective: "", type: "anchor", start: true }],
      transitions: [],
      roster: [],
    });
    expect(useDraftStore.getState().errors).toHaveLength(0);
    useDraftStore.getState().mutate((draft) => removeCheckpoint(draft, "start"));
    expect(useDraftStore.getState().errors.length).toBeGreaterThan(0);
  });

  it("clamps a stale checkpoint selection on undo", () => {
    const store = useDraftStore.getState();
    store.mutate((draft) => addCheckpoint(draft, { id: "extra", name: "Extra", objective: "", type: "intermediate" }));
    useDraftStore.getState().selectCheckpoint("extra");
    useDraftStore.getState().undo();
    const state = useDraftStore.getState();
    expect(state.draft.checkpoints.some((cp) => cp.id === "extra")).toBe(false);
    expect(state.selectedCheckpointId).toBe("start");
  });

  it("loadDraft selects the first checkpoint and clears history", () => {
    useDraftStore.getState().mutate((draft) => addQuality(draft));
    load({
      format: 2,
      title: "Fresh",
      description: "",
      qualities: [],
      checkpoints: [{ id: "cp0", name: "Zero", objective: "", type: "anchor", start: true }],
      transitions: [],
      roster: [],
    });
    const state = useDraftStore.getState();
    expect(state.selectedCheckpointId).toBe("cp0");
    expect(state.past).toHaveLength(0);
    expect(state.dirty).toBe(false);
  });
});
