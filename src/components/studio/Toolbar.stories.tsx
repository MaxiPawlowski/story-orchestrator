import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import Toolbar from "./Toolbar";

const meta: Meta<typeof Toolbar> = {
  title: "Studio/Primitives/Toolbar",
  component: Toolbar,
  args: {
    hasChanges: true,
    canAddTransition: true,
    savePending: false,
    saveDisabled: false,
    saveAsDisabled: false,
    onExport: fn(),
    onImportPick: fn(),
    onReset: fn(),
    onSave: fn(),
    onSaveAs: fn(),
  },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Toolbar {...args} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof Toolbar>;

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByRole("button", { name: "Export JSON" }));
    await expect(args.onExport).toHaveBeenCalledTimes(1);
  },
};

export const Saving: Story = {
  args: { savePending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
  },
};

export const NothingToSave: Story = {
  args: { hasChanges: false, saveDisabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Reset Draft" })).toBeDisabled();
  },
};
