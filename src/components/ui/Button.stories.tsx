import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { Button } from "./Button";

const meta = { title: "Kit/Button", component: Button, args: { children: "Show me", onClick: fn() } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (args) => (
    <div className="so-toolbar">
      <Button {...args} variant="primary">Save</Button>
      <Button {...args} variant="secondary">Save as</Button>
      <Button {...args} variant="ghost">Keep it</Button>
      <Button {...args} variant="danger" icon="fa-trash-can">Delete</Button>
      <Button {...args} size="sm">Small</Button>
      <Button {...args} disabled>Disabled</Button>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole("button", { name: "Save" });
    await expect(save).toHaveAttribute("data-variant", "primary");
    await expect(save).toHaveAttribute("type", "button");
    await userEvent.click(save);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    await expect(canvas.getByRole("button", { name: "Delete" }).querySelector("i")).toHaveAttribute("aria-hidden", "true");
  },
};

export const BusyWhileWorking: Story = {
  args: { children: "Restart story", variant: "primary", work: () => new Promise((resolve) => setTimeout(resolve, 1500)) },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button");
    await userEvent.click(button);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};
