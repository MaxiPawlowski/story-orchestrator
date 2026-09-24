import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import { BranchNotice } from "./BranchNotice";

const meta: Meta<typeof BranchNotice> = {
  title: "Drawer/BranchNotice",
  component: BranchNotice,
  args: { onContinue: fn() },
};

export default meta;

type Story = StoryObj<typeof BranchNotice>;

export const Default: Story = {
  args: { identity: { kind: "branch", parentChat: "Group - 2026-09-24@10h00m00s", checkpointName: "The Ruined Gate" } },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("last at The Ruined Gate");
    await expect(canvas.getByRole("status")).not.toHaveTextContent("Group - 2026");
    await userEvent.click(canvas.getByRole("button", { name: "Continue from here" }));
    await expect(args.onContinue).toHaveBeenCalledTimes(1);
  },
};

export const NoCheckpointName: Story = {
  args: { identity: { kind: "branch", parentChat: "parent-chat", checkpointName: null } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("This chat branched from a story in progress. Continue from here");
  },
};
