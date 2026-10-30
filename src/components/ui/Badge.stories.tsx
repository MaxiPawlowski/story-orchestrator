import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { Badge, Chip } from "./Badge";

const meta = { title: "Kit/Badge", component: Badge, args: { children: "On" } } satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TonesCarryAnIcon: Story = {
  render: () => (
    <div className="so-toolbar">
      <Badge>Default</Badge>
      <Badge tone="info">Story</Badge>
      <Badge tone="ok">On</Badge>
      <Badge tone="warn">1 book missing</Badge>
      <Badge tone="error">Off</Badge>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const icons = [...canvasElement.querySelectorAll(".so-badge")].map((badge) => badge.querySelector("i")?.className ?? null);
    await expect(icons).toEqual([null, "fa-solid fa-circle-info", "fa-solid fa-check", "fa-solid fa-triangle-exclamation", "fa-solid fa-circle-xmark"]);
  },
};

export const Chips: StoryObj<typeof Chip> = {
  render: () => {
    const onRemove = fn();
    return (
      <div className="so-toolbar">
        <Chip selected onClick={fn()}>Selected</Chip>
        <Chip onClick={fn()} selected={false}>Not selected</Chip>
        <Chip tone="info" onRemove={onRemove} removeLabel="Remove Mara">Mara</Chip>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Selected" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Remove Mara" }));
  },
};
