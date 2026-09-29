import type { Meta, StoryObj } from "@storybook/react";
import { within, expect, userEvent } from "@storybook/test";
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
    const icon = await canvas.findByRole("button", { name: /Help: Click a checkpoint/ });
    await userEvent.click(icon);
    await expect(canvas.getByRole("note")).toHaveTextContent("Click a checkpoint to configure it");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("note")).toBeNull();
  },
};

export const WithI18nKey: Story = {
  args: { i18nKey: "studio.help.checkpoint" },
};

export const WithReference: Story = {
  args: { href: "/scripts/extensions/third-party/story-orchestrator/README.md#quick-start", reference: "Setup guide" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Help: Click a checkpoint/ }));
    await expect(canvas.getByRole("link", { name: "Setup guide" })).toHaveAttribute("href", "/scripts/extensions/third-party/story-orchestrator/README.md#quick-start");
  },
};
