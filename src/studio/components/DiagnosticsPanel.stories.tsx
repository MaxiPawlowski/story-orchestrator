import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import DiagnosticsPanel from "./DiagnosticsPanel";
import { problemStory, sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof DiagnosticsPanel> = {
  title: "Studio/DiagnosticsPanel",
  component: DiagnosticsPanel,
};

export default meta;

type Story = StoryObj<typeof DiagnosticsPanel>;

export const Clean: Story = {
  beforeEach: () => {
    seedDraft(sampleStory());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/ready to save/)).toBeInTheDocument();
  },
};

export const WithWarnings: Story = {
  beforeEach: () => {
    seedDraft(problemStory());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("anchor-unreachable")).toBeInTheDocument();
    await expect(canvas.getByText("threshold-unsatisfiable")).toBeInTheDocument();
  },
};
