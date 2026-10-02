import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import CheckpointEditor from "./CheckpointEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof CheckpointEditor> = {
  title: "Studio/CheckpointEditor",
  component: CheckpointEditor,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof CheckpointEditor>;

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Infiltrate/ }));
    await expect(canvas.getByLabelText("Tension target")).toHaveValue("tense");
    await expect(canvas.getByLabelText("Snapshot value")).toHaveValue("stealth");
  },
};

export const AuthorsAMotivePerMember: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Motive for The Guide"), "keep the party off the east stair");
    await expect(useDraftStore.getState().draft.checkpoints[0].motives).toEqual({ guide: "keep the party off the east stair" });
    await userEvent.clear(canvas.getByLabelText("Motive for The Guide"));
    await expect(useDraftStore.getState().draft.checkpoints[0].motives).toBeUndefined();
  },
};

export const EditName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameInput = canvas.getByLabelText("Name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Prologue");
    await expect(useDraftStore.getState().draft.checkpoints[0].name).toBe("Prologue");
  },
};

export const AddAndDelete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Checkpoint" }));
    await expect(useDraftStore.getState().draft.checkpoints).toHaveLength(4);
    await userEvent.click(canvas.getByRole("button", { name: "Delete checkpoint" }));
    await expect(useDraftStore.getState().draft.checkpoints).toHaveLength(4);
    await expect(canvas.getByText(/click Delete again to confirm/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Delete checkpoint" }));
    await expect(useDraftStore.getState().draft.checkpoints).toHaveLength(3);
  },
};

export const ToggleNpcReply: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("NPC replies"));
    await expect(useDraftStore.getState().draft.checkpoints[0].effects?.npc_replies).toHaveLength(1);
  },
};

// Deterministic stagecraft: a checkpoint names a background and the boundary switches to it.
export const ToggleBackground: Story = {
  args: { backgroundNames: ["tavern day.jpg", "landscape postapoc.jpg"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Background"));
    await expect(useDraftStore.getState().draft.checkpoints[0].effects?.background).toEqual({ name: "tavern day.jpg" });
    const field = canvas.getByLabelText("Background file");
    await userEvent.clear(field);
    await userEvent.type(field, "royal.jpg");
    await expect(useDraftStore.getState().draft.checkpoints[0].effects?.background).toEqual({ name: "royal.jpg" });
    await userEvent.click(canvas.getByLabelText("Background"));
    await expect(useDraftStore.getState().draft.checkpoints[0].effects?.background).toBeUndefined();
  },
};

// v2.4 plan 06 (X20): the preset is an overlay on this checkpoint's replies, and the editor says so.
export const PresetSaysOverlay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Preset"));
    await userEvent.type(canvas.getByLabelText("Preset name"), "Artemis Cool");
    await expect(useDraftStore.getState().draft.checkpoints[0].effects?.preset).toBe("Artemis Cool");
    await expect(canvas.getByText(/this checkpoint's replies only; your selected preset is untouched/)).toBeInTheDocument();
  },
};

export const AuthorNoteKeepsRole: Story = {
  beforeEach: () => {
    const story = sampleStory();
    story.checkpoints[0].effects = { author_note: { text: "Whisper.", position: "chat", depth: 2, role: "user" } };
    seedDraft(story);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Author note text"), "!");
    await expect(useDraftStore.getState().draft.checkpoints[0].effects?.author_note).toEqual({ text: "Whisper.!", position: "chat", depth: 2, role: "user" });
    await userEvent.click(canvas.getByLabelText("Inject blackboard"));
    await expect(useDraftStore.getState().draft.checkpoints[0].effects?.author_note).toEqual({ text: "Whisper.!", position: "chat", depth: 2, role: "user", inject_blackboard: true });
  },
};

export const ToggleTalkControl: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Talk control"));
    await expect(useDraftStore.getState().draft.checkpoints[0].talk_control).toEqual({});
    await userEvent.click(canvas.getByLabelText("LLM director picks the speaker"));
    await expect(useDraftStore.getState().draft.checkpoints[0].talk_control).toEqual({ director: true });
  },
};

export const CastChangesShowRosterIdsAsMembers: Story = {
  beforeEach: () => {
    const story = sampleStory();
    seedDraft({
      ...story,
      roster: [...story.roster, { id: "lord_vael", name: "Lord Vael" }, { id: "player", name: "The Apprentice", role: "player persona" }],
      checkpoints: story.checkpoints.map((checkpoint, index) => (index === 0 ? { ...checkpoint, effects: { cast_changes: { disable: ["lord_vael", "ghost"] } } } : checkpoint)),
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [, disableVael] = canvas.getAllByRole("checkbox", { name: "Lord Vael" });
    await expect(disableVael).toBeChecked();
    await expect(canvas.queryByRole("checkbox", { name: "The Apprentice" })).toBeNull();
    const unresolved = canvasElement.querySelector("[data-so='cast-unresolved']");
    await expect(unresolved?.textContent).toContain("ghost");
    await userEvent.click(within(unresolved as HTMLElement).getByRole("button", { name: "Remove" }));
    await expect(useDraftStore.getState().draft.checkpoints[0].effects?.cast_changes).toEqual({ enable: [], disable: ["Lord Vael"] });
  },
};
