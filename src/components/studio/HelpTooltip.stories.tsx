import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import HelpTooltip from "./HelpTooltip";

const meta: Meta<typeof HelpTooltip> = {
  title: "Studio/Primitives/HelpTooltip",
  component: HelpTooltip,
  args: { title: "Click a checkpoint to configure it" },
};

export default meta;

type Story = StoryObj<typeof HelpTooltip>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const icon = await canvas.findByRole("img", { name: "Click a checkpoint to configure it" });
    await expect(icon).toBeInTheDocument();
  },
};

export const WithI18nKey: Story = {
  args: { i18nKey: "studio.help.checkpoint" },
};
