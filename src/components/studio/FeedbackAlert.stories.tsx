import type { Meta, StoryObj } from "@storybook/react";
import FeedbackAlert from "./FeedbackAlert";

const meta: Meta<typeof FeedbackAlert> = {
  title: "Studio/FeedbackAlert",
  component: FeedbackAlert,
};

export default meta;
type Story = StoryObj<typeof FeedbackAlert>;

export const Success: Story = {
  args: { feedback: { type: "success", message: "Story saved" } },
};

export const Error: Story = {
  args: { feedback: { type: "error", message: "Validation failed" } },
};

export const Empty: Story = {
  args: { feedback: null },
};
