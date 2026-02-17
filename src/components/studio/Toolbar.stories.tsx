import type { Meta, StoryObj } from "@storybook/react";
import Toolbar from "./Toolbar";
import { noop } from "@components/stories/storybookMocks";

const meta: Meta<typeof Toolbar> = {
  title: "Studio/Toolbar",
  component: Toolbar,
  args: {
    hasChanges: true,
    savePending: false,
    saveDisabled: false,
    saveAsDisabled: false,
    canAddTransition: true,
    onExport: noop,
    onImportPick: noop,
    onReset: noop,
    onSave: noop,
    onSaveAs: noop,
  },
  decorators: [(Story) => <div className="flex flex-wrap gap-2"><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof Toolbar>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    saveDisabled: true,
    saveAsDisabled: true,
    canAddTransition: false,
  },
};
