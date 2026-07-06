import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import ScopePreview from "./ScopePreview";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof ScopePreview> = {
  title: "Studio/ScopePreview",
  component: ScopePreview,
  args: { checkpointId: "start" },
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof ScopePreview>;

export const FromStart: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByLabelText("Scope preview");
    await expect(within(list).getByText("trust")).toBeInTheDocument();
    await expect(within(list).getByText("route")).toBeInTheDocument();
  },
};

export const TerminalAnchor: Story = {
  args: { checkpointId: "cache" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Scope preview")).toBeInTheDocument();
  },
};
