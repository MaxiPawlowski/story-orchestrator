import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import StoryEditor from "./StoryEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof StoryEditor> = {
  title: "Studio/StoryEditor",
  component: StoryEditor,
  args: {
    personaNames: ["Traveller"],
    memberNames: ["Arin", "Ponticius", "Luke"],
    lorebookNames: ["Xentar Checkpoints"],
  },
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof StoryEditor>;

export const NewStory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "From title" }));
    await expect(canvas.getByLabelText("Story id")).toHaveValue("the-ruins-heist");
    await expect(canvas.getByLabelText("Story version")).toHaveValue("1");
  },
};

export const IdLockedAfterSave: Story = {
  args: { idLocked: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Story id")).toBeDisabled();
  },
};

export const AuthorRequirements: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Cast member" }));
    await expect(canvas.getByLabelText("Cast member 1")).toHaveValue("Arin");
    await userEvent.click(canvas.getByRole("button", { name: "+ Lorebook" }));
    await expect(useDraftStore.getState().draft.requirements).toEqual({ members: ["Arin"], lorebooks: ["Xentar Checkpoints"] });
  },
};

// Nothing to pick from, so the author types each name. Every keystroke goes through the mutation:
// a trailing space and a blank row must survive it, and parse trims on the way out.
export const TypedMultiWordNames: Story = {
  args: { personaNames: [], lorebookNames: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Persona" }));
    const persona = canvas.getByLabelText("Persona 1");
    await expect(persona).toHaveValue("");
    await expect(useDraftStore.getState().draft.requirements).toEqual({ personas: [""] });
    await userEvent.type(persona, "Max ");
    await expect(persona).toHaveValue("Max ");
    await expect(useDraftStore.getState().draft.requirements).toEqual({ personas: ["Max "] });
    await userEvent.type(persona, "Power");
    await expect(persona).toHaveValue("Max Power");
    await userEvent.click(canvas.getByRole("button", { name: "+ Curator lorebook" }));
    await expect(canvas.getByLabelText("Curator lorebook 1")).toHaveValue("");
    await userEvent.type(canvas.getByLabelText("Curator lorebook 1"), "Xentar Checkpoints");
    await expect(canvas.getByLabelText("Curator lorebook 1")).toHaveValue("Xentar Checkpoints");
    const draft = useDraftStore.getState().draft;
    await expect(draft.requirements).toEqual({ personas: ["Max Power"] });
    await expect(draft.stagecraft).toEqual({ lorebooks: ["Xentar Checkpoints"] });
  },
};

// The curator's write scope is authored here and nowhere else (plan 07): an empty list means no
// background agent may touch any lorebook.
export const CuratorAllowlist: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(useDraftStore.getState().draft.stagecraft).toBeUndefined();
    await userEvent.click(canvas.getByRole("button", { name: "+ Curator lorebook" }));
    await expect(canvas.getByLabelText("Curator lorebook 1")).toHaveValue("Xentar Checkpoints");
    await expect(useDraftStore.getState().draft.stagecraft).toEqual({ lorebooks: ["Xentar Checkpoints"] });
    await userEvent.click(canvas.getByRole("button", { name: "Remove Curator lorebook 1" }));
    await expect(useDraftStore.getState().draft.stagecraft).toBeUndefined();
  },
};

// v2.2 plan 04: the books lore-select may judge; the per-turn count appears once a book is listed.
export const LoreSelectScope: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByLabelText("Entries forced per turn")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "+ Lore-select lorebook" }));
    await expect(useDraftStore.getState().draft.lore_select).toEqual({ lorebooks: ["Xentar Checkpoints"] });
    await userEvent.type(canvas.getByLabelText("Entries forced per turn"), "6");
    await expect(useDraftStore.getState().draft.lore_select).toEqual({ lorebooks: ["Xentar Checkpoints"], top_k: 6 });
    await userEvent.click(canvas.getByRole("button", { name: "Remove Lore-select lorebook 1" }));
    await expect(useDraftStore.getState().draft.lore_select).toBeUndefined();
  },
};

// v2.2 plan 03: the places the scene tracker may pick from, typed by hand (spaces included).
export const ScenePlaces: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(useDraftStore.getState().draft.scene_read).toBeUndefined();
    await userEvent.click(canvas.getByRole("button", { name: "+ Place" }));
    await userEvent.type(canvas.getByLabelText("Place 1"), "guild hall");
    await expect(useDraftStore.getState().draft.scene_read).toEqual({ locations: ["guild hall"] });
    await userEvent.click(canvas.getByLabelText(/Add the scene line to the prompt/));
    await expect(useDraftStore.getState().draft.scene_read).toEqual({ locations: ["guild hall"], inject: false });
    await userEvent.click(canvas.getByRole("button", { name: "Remove Place 1" }));
    await expect(useDraftStore.getState().draft.scene_read).toEqual({ inject: false });
  },
};

export const ArcShapeAndBridges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("Dramatic shape"), "rising");
    await userEvent.click(canvas.getByRole("button", { name: "+ Bridge" }));
    await userEvent.type(canvas.getByLabelText("Bridge 1 keyword"), "relic");
    const draft = useDraftStore.getState().draft;
    await expect(draft.arc_template).toBe("rising");
    await expect(draft.arc_bridges).toEqual([{ arcMatch: "relic", anchor: "cache", amount: 1 }]);
  },
};
