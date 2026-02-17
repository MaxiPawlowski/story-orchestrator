import type { Meta, StoryObj } from "@storybook/react";
import HelpTooltip from "./HelpTooltip";

const meta: Meta<typeof HelpTooltip> = {
  title: "Studio/HelpTooltip",
  component: HelpTooltip,
  args: {
    title: "Tooltip content",
  },
};

export default meta;
type Story = StoryObj<typeof HelpTooltip>;

export const Default: Story = {};

export const WithI18n: Story = {
  args: { i18nKey: "story.help.test" },
};
