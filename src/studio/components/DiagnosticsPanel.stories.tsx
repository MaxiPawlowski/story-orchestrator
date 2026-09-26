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

// v2.4 plan 06 T16b: a checkpoint with no note of its own plays under an earlier one's; the panel
// says whose, consequence first.
export const InheritsAuthorNote: Story = {
  beforeEach: () => {
    const story = sampleStory();
    story.checkpoints = story.checkpoints.map((checkpoint, index) => (index === 0 ? {
      ...checkpoint,
      effects: { ...checkpoint.effects, author_note: "Keep the ruins quiet and watchful." },
    } : checkpoint));
    seedDraft(story);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("checkpoint-inherits-author-note").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText(/The model keeps being told an earlier checkpoint's note here\./).length).toBeGreaterThan(0);
    await expect(canvas.getAllByText(/plays under the note of/).length).toBeGreaterThan(0);
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
