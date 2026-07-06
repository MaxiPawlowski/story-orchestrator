import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import StudioModal from "./StudioModal";
import { seedDraft, seedEmptyDraft, sampleStory } from "./stories/fixtures";

const meta: Meta<typeof StudioModal> = {
  title: "Studio/StudioModal",
  component: StudioModal,
  args: { onClose: fn() },
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof StudioModal>;

export const Seeded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Story title")).toHaveValue("The Ruins Heist");
    await userEvent.click(canvas.getByRole("tab", { name: "Qualities" }));
    await expect(canvas.getByText("trust")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  beforeEach: () => {
    seedEmptyDraft();
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Close studio" }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const CopilotTabEnabled: Story = {
  args: { copilotEnabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("tab", { name: "Copilot" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Copilot" }));
    await expect(canvas.getByLabelText("Copilot unavailable")).toBeInTheDocument();
  },
};

export const CopilotTabHiddenWhenDisabled: Story = {
  args: { copilotEnabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab", { name: "Copilot" })).toBeNull();
  },
};
