import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import FeedbackAlert from "./FeedbackAlert";

const meta: Meta<typeof FeedbackAlert> = {
  title: "Studio/Primitives/FeedbackAlert",
  component: FeedbackAlert,
};

export default meta;

type Story = StoryObj<typeof FeedbackAlert>;

export const Success: Story = {
  args: { feedback: { type: "success", message: "Saved “The Ruins Heist” to library." } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Saved/)).toBeInTheDocument();
  },
};

export const Error: Story = {
  args: { feedback: { type: "error", message: "3 validation errors block save." } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/validation errors/)).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: { feedback: null },
};
