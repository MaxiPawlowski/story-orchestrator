import type { Meta, StoryObj } from "@storybook/react";
import Checkpoints from "./index";
import { CheckpointStatus } from "@utils/story-state";

const meta: Meta<typeof Checkpoints> = {
  title: "Drawer/Checkpoints",
  component: Checkpoints,
};

export default meta;
type Story = StoryObj<typeof Checkpoints>;

export const Default: Story = {
  args: {
    title: "Story Checkpoints",
    checkpoints: [
      { id: "cp1", name: "Arrival", objective: "Reach the gate", status: CheckpointStatus.Complete },
      { id: "cp2", name: "Chamber", objective: "Solve the seal", status: CheckpointStatus.Current },
      { id: "cp3", name: "Escape", objective: "Leave safely", status: CheckpointStatus.Pending },
    ],
    lastQueuedEvaluation: { reason: "trigger", turn: 6, matchedPattern: "/open gate/i" },
  },
};
