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
