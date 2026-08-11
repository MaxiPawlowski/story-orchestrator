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
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByLabelText("Story title")).toHaveValue("The Ruins Heist");
    await userEvent.click(await canvas.findByRole("tab", { name: "Qualities" }));
    await expect(await canvas.findByText("trust")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  beforeEach: () => {
    seedEmptyDraft();
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Close studio" }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const CopilotTabEnabled: Story = {
  args: { copilotEnabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Copilot" }));
    await expect(await canvas.findByLabelText("Copilot unavailable")).toBeInTheDocument();
  },
};

export const CopilotTabHiddenWhenDisabled: Story = {
  args: { copilotEnabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("button", { name: "Close studio" });
    await expect(canvas.queryByRole("tab", { name: "Copilot" })).toBeNull();
  },
};
