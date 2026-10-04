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

export const PublicCopyAndArt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Player introduction"), "You arrive at the ruins.");
    await userEvent.click(canvas.getByLabelText("At checkpoint changes"));
    await userEvent.type(canvas.getByLabelText("Visual direction"), "Warm dusk and ink outlines");
    await userEvent.type(canvas.getByLabelText("The Guide appearance"), "Red scarf");
    const story = useDraftStore.getState().draft;
    await expect(story.player_intro).toBe("You arrive at the ruins.");
    await expect(story.description).toBe("A two-beat infiltration of the sun ruins.");
    await expect(story.illustrations).toEqual({ checkpoints: true, style: "Warm dusk and ink outlines", appearances: { guide: "Red scarf" } });
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

// v2.7 C10: an entry inside a curator book that the curator is never shown nor allowed to write.
export const CuratorExclusion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Curator lorebook" }));
    await userEvent.click(canvas.getByRole("button", { name: "+ Excluded entry" }));
    await expect(canvas.getByLabelText("Excluded lorebook 1")).toHaveValue("Xentar Checkpoints");
    await userEvent.type(canvas.getByLabelText("Excluded entries 1"), "House style,Tone");
    await expect(useDraftStore.getState().draft.stagecraft).toEqual({ lorebooks: ["Xentar Checkpoints"], exclude: [{ lorebook: "Xentar Checkpoints", comments: ["House style", "Tone"] }] });
    await userEvent.type(canvas.getByLabelText("Curator lorebook 1"), " 2");
    await expect(useDraftStore.getState().draft.stagecraft?.exclude).toEqual([{ lorebook: "Xentar Checkpoints", comments: ["House style", "Tone"] }]);
    await userEvent.click(canvas.getByRole("button", { name: "Remove exclusion 1" }));
    await expect(useDraftStore.getState().draft.stagecraft).toEqual({ lorebooks: ["Xentar Checkpoints 2"] });
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

// v2.5 plan 08 L5: the exclusive switch appears once a book is listed and is kept only while on.
export const LoreSelectExclusive: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByLabelText("Exclude unpicked entries")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "+ Lore-select lorebook" }));
    await userEvent.click(canvas.getByLabelText("Exclude unpicked entries"));
    await expect(useDraftStore.getState().draft.lore_select).toEqual({ lorebooks: ["Xentar Checkpoints"], exclusive: true });
    await userEvent.click(canvas.getByLabelText("Exclude unpicked entries"));
    await expect(useDraftStore.getState().draft.lore_select).toEqual({ lorebooks: ["Xentar Checkpoints"] });
  },
};

// v2.4 plan 07 T23: house rules are a list of one-demand rules, capped at 8, with the count shown.
export const HouseRules: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const panel = canvasElement.querySelector('[data-so="house-rules"]') as HTMLElement;
    await expect(within(panel).getByText("0/8")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "+ House rule" }));
    await userEvent.type(canvas.getByLabelText("House rule 1"), "No character uses a gun.");
    await expect(useDraftStore.getState().draft.house_rules).toEqual(["No character uses a gun."]);
    await expect(within(panel).getByText("1/8")).toBeInTheDocument();
    for (let count = 1; count < 8; count += 1) await userEvent.click(canvas.getByRole("button", { name: "+ House rule" }));
    await expect(canvas.getByRole("button", { name: "+ House rule" })).toBeDisabled();
    await expect(within(panel).getByText("8/8")).toBeInTheDocument();
    for (let count = 8; count > 0; count -= 1) await userEvent.click(canvas.getByRole("button", { name: `Remove House rule ${count}` }));
    await expect(useDraftStore.getState().draft.house_rules).toBeUndefined();
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

// v2.4 plan 06 T16a: absent means auto; unticking writes "off", ticking again returns to absent.
export const ObjectiveBlockOff: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByLabelText(/Add the objective when a checkpoint has no author note/);
    await expect(box).toBeChecked();
    await userEvent.click(box);
    await expect(useDraftStore.getState().draft.objective_block).toBe("off");
    await userEvent.click(box);
    await expect(useDraftStore.getState().draft.objective_block).toBeUndefined();
  },
};

export const KindSaga: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByLabelText("Story kind");
    await expect(select).toHaveValue("story");
    await expect(useDraftStore.getState().draft.kind).toBeUndefined();
    await userEvent.selectOptions(select, "saga");
    await expect(useDraftStore.getState().draft.kind).toBe("saga");
    await userEvent.selectOptions(select, "story");
    await expect(useDraftStore.getState().draft.kind).toBeUndefined();
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
