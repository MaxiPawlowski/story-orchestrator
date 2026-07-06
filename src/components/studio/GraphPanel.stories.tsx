import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import GraphPanel from "./GraphPanel";
import type { StoryGraphDraft } from "./graphPanelUtils";

const BRANCHING: StoryGraphDraft = {
  start: "start",
  checkpoints: [
    { id: "start", name: "Approach", transitions: [{ id: "e1", to: "infiltrate", label: "route in [stealth, force]" }] },
    { id: "infiltrate", name: "Infiltrate", transitions: [{ id: "e2", to: "cache", label: "trust >= 2 AND NOT (alarm == true)" }] },
    { id: "cache", name: "The Cache", transitions: [] },
  ],
};

const meta: Meta<typeof GraphPanel> = {
  title: "Studio/Primitives/GraphPanel",
  component: GraphPanel,
  args: {
    draft: BRANCHING,
    selectedId: "infiltrate",
    canAddTransition: true,
    onSelect: fn(),
    onAddCheckpoint: fn(),
    onAddTransition: fn(),
  },
  render: (args) => (
    <div style={{ height: 440, display: "flex" }}>
      <GraphPanel {...args} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof GraphPanel>;

export const Branching: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "+ Checkpoint" }));
    await expect(args.onAddCheckpoint).toHaveBeenCalledTimes(1);
  },
};

export const Empty: Story = {
  args: { draft: { start: undefined, checkpoints: [] }, selectedId: null, canAddTransition: false },
};
