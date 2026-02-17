import type { Meta, StoryObj } from "@storybook/react";
import RequirementIndicator from "./index";

const meta: Meta<typeof RequirementIndicator> = {
  title: "Common/RequirementIndicator",
  component: RequirementIndicator,
  args: {
    text: "Persona loaded",
    color: "green",
    detail: "All required role bindings found",
  },
};

export default meta;
type Story = StoryObj<typeof RequirementIndicator>;

export const Ready: Story = {};

export const MissingLore: Story = {
  args: {
    text: "Lore missing",
    color: "red",
    detail: "Global lorebook not present",
  },
};

export const NeedsReload: Story = {
  args: {
    color: "yellow",
    text: "Requirements stale",
    onReload: () => {},
    detail: "Click reload to rescan persona and group",
  },
};
