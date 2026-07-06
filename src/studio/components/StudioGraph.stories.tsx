import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import StudioGraph from "./StudioGraph";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof StudioGraph> = {
  title: "Studio/StudioGraph",
  component: StudioGraph,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
  render: () => (
    <div style={{ height: 520, display: "flex" }}>
      <StudioGraph />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof StudioGraph>;

export const Seeded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "+ Checkpoint" });
    await expect(canvas.getByText("Mermaid export")).toBeInTheDocument();
  },
};
