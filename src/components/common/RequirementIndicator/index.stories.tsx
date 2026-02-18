import type { Meta, StoryObj } from "@storybook/react";
import RequirementIndicator from "./index";

const meta: Meta<typeof RequirementIndicator> = {
  title: "Common/RequirementIndicator",
  component: RequirementIndicator,
  args: {
    text: "Persona loaded",
    status: "success",
    detail: "All required role bindings found",
  },
  decorators: [
    (Story) => (
      <div id="drawer-manager" className="pinnedOpen">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RequirementIndicator>;

export const Ready: Story = {};

export const MissingLore: Story = {
  args: {
    text: "Lore missing",
    status: "error",
    detail: "Global lorebook not present",
  },
};

export const NeedsReload: Story = {
  args: {
    status: "warning",
    text: "Requirements stale",
    onReload: () => {},
    detail: "Click reload to rescan persona and group",
  },
};
