import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import StudioGraph from "./StudioGraph";
import { sampleStory, seedDraft } from "../stories/fixtures";
import { useDraftStore } from "../draft";
import { toMermaid } from "../graphAdapter";

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
    const source = toMermaid(useDraftStore.getState().draft);
    await expect(source).toContain('subgraph chapter_act1["The Approach"]');
    await expect(source).toContain('subgraph chapter_act2["The Vault"]');
  },
};

export const NarrowStudio: Story = {
  render: () => (
    <div style={{ width: 345, height: 520, display: "flex" }}>
      <StudioGraph />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "+ Checkpoint" });
    await expect(canvasElement.querySelector('[data-so="graph-narrow-hint"]')).toHaveTextContent("tap a checkpoint to edit");
  },
};

export const Seeded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "+ Checkpoint" });
    const root = canvasElement.querySelector('[data-so="studio-graph"]') as HTMLElement;
    await expect(root).not.toBeNull();
    if (root.dataset.split) await expect(canvasElement.querySelector('[data-so="graph-editor"]')).toHaveAttribute("data-pane", "checkpoint");
  },
};
