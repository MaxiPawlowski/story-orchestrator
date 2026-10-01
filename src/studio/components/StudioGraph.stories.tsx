import type { Meta, StoryObj } from "@storybook/react";
import { within, expect, userEvent } from "@storybook/test";
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

export const ChapterLanes: Story = {
  beforeEach: () => {
    const story = sampleStory();
    seedDraft({
      ...story,
      chapters: [{ id: "act1", title: "The Approach" }, { id: "act2", title: "The Vault" }],
      checkpoints: story.checkpoints.map((checkpoint) => ({ ...checkpoint, chapter: checkpoint.id === "cache" ? "act2" : "act1" })),
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "+ Checkpoint" });
    await userEvent.click(canvas.getByText("Mermaid export"));
    const source = canvas.getByLabelText("Mermaid source");
    await expect(source).toHaveTextContent('subgraph chapter_act1["The Approach"]');
    await expect(source).toHaveTextContent('subgraph chapter_act2["The Vault"]');
  },
};

export const Seeded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "+ Checkpoint" });
    await expect(canvas.getByText("Mermaid export")).toBeInTheDocument();
  },
};
