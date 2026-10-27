import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import VisualPacksPanel from "./VisualPacksPanel";

const ref = (id: string, fill: string) => ({ id, digest: fill.repeat(64) });

const meta: Meta<typeof VisualPacksPanel> = {
  title: "Studio/VisualPacksPanel",
  component: VisualPacksPanel,
  args: {
    packs: { style: ref("fixture-ink-style", "a"), identities: { guide: ref("fixture-wanderer", "b") }, places: { cp1: ref("fixture-harbor", "c") } },
    memberNames: { guide: "The Guide" },
    checkpointNames: { cp1: "At the gate" },
    onChange: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof VisualPacksPanel>;

export const ListsAndRemovesBindings: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText(/fixture-/)).toHaveLength(3);
    await expect(canvas.getByText("The Guide")).toBeInTheDocument();
    await expect(canvas.getByText("bbbbbbbbbbbb")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Remove the visual pack of The Guide" }));
    await expect(args.onChange).toHaveBeenCalledWith({ style: ref("fixture-ink-style", "a"), places: { cp1: ref("fixture-harbor", "c") } });
  },
};

export const NothingBound: Story = {
  args: { packs: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No visual packs are bound.")).toBeInTheDocument();
  },
};
