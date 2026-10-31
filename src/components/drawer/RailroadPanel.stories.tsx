import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import type { RailroadView } from "@runtime/railroadView";
import { RailroadPanel } from "./RailroadPanel";

const view: RailroadView = {
  living: 3, lead: 1, pace: 2, paceShare: 2 / 3, overFloor: true, quietRuns: 1, longestQuiet: 3, branches: { liv_2: 1 },
  rows: [
    { boundary: 4, messageId: 9, from: "liv_open", to: "liv_1_way", leaf: "pace" },
    { boundary: 9, messageId: 20, from: "liv_1", to: "liv_2_way", leaf: "lead" },
    { boundary: 13, messageId: 29, from: "liv_2", to: "liv_b1_way", leaf: "pace" },
  ],
};

const meta: Meta<typeof RailroadPanel> = {
  title: "Drawer/RailroadPanel",
  component: RailroadPanel,
};

export default meta;

type Story = StoryObj<typeof RailroadPanel>;

export const PaceForcedAboveTheFloor: Story = {
  args: { view },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "How the written-ahead story moved" })).toBeInTheDocument();
    await expect(canvas.getByText(/above 33%/)).toBeInTheDocument();
    await expect([...canvasElement.querySelectorAll('[data-so="railroad-row"]')].map((row) => row.getAttribute("data-leaf"))).toEqual(["pace", "lead", "pace"]);
  },
};

export const NothingRecorded: Story = {
  args: { view: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="railroad"]')).toBeNull();
  },
};
