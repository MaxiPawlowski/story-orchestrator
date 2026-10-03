import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import StoryDisplayEditor from "./StoryDisplayEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof StoryDisplayEditor> = {
  title: "Studio/StoryDisplayEditor",
  component: StoryDisplayEditor,
};

export default meta;

type Story = StoryObj<typeof StoryDisplayEditor>;

export const AllOnByDefault: Story = {
  beforeEach: () => {
    seedDraft(sampleStory());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const boxes = [...canvasElement.querySelectorAll<HTMLInputElement>('[data-so="story-display-toggle"]')];
    await expect(boxes.map((box) => box.checked)).toEqual([true, true, true, true, true]);
    await userEvent.click(canvas.getByLabelText("Chapter title cards"));
    await expect(useDraftStore.getState().draft.display).toEqual({ chapter_card: false });
    await userEvent.click(canvas.getByLabelText("Chapter title cards"));
    await expect(useDraftStore.getState().draft.display).toBeUndefined();
  },
};

export const KeepsLoreNames: Story = {
  beforeEach: () => {
    seedDraft({ ...sampleStory(), display: { lore_names_public: true, wand: false } });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Story entries in the wand menu")).not.toBeChecked();
    await userEvent.click(canvas.getByLabelText("Story entries in the wand menu"));
    await expect(useDraftStore.getState().draft.display).toEqual({ lore_names_public: true });
  },
};
