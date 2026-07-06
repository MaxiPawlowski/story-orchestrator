import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import StudioToolbar from "./StudioToolbar";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof StudioToolbar> = {
  title: "Studio/StudioToolbar",
  component: StudioToolbar,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof StudioToolbar>;

export const SaveToLibrary: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(canvas.getByText(/Saved .* to library/)).toBeInTheDocument();
  },
};
