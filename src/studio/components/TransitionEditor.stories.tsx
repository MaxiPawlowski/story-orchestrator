import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import TransitionEditor from "./TransitionEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof TransitionEditor> = {
  title: "Studio/TransitionEditor",
  component: TransitionEditor,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof TransitionEditor>;

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("From")).toHaveValue("start");
    await expect(canvas.getByLabelText("To")).toHaveValue("infiltrate");
  },
};

export const EditPriority: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const priority = canvas.getByLabelText("Priority");
    await userEvent.clear(priority);
    await userEvent.type(priority, "5");
    await expect(useDraftStore.getState().draft.transitions[0].priority).toBe(5);
  },
};

export const AddAndDelete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Transition" }));
    await expect(useDraftStore.getState().draft.transitions).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "Delete transition" }));
    await expect(useDraftStore.getState().draft.transitions).toHaveLength(2);
  },
};

export const ProgressEffect: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Progress effect"));
    await expect(useDraftStore.getState().draft.transitions[0].effects?.progress?.anchor).toBe("cache");
  },
};
