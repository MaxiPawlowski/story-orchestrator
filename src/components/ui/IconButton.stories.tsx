import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { IconButton } from "./IconButton";

const meta = { title: "Kit/IconButton", component: IconButton, args: { icon: "fa-xmark", label: "Close help", onClick: fn() } } satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LabelIsTheName: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "Close help" });
    await expect(button).toHaveAttribute("title", "Close help");
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="so-toolbar">
      <IconButton {...args} />
      <IconButton {...args} size="sm" label="Small close" />
      <IconButton {...args} variant="secondary" icon="fa-gear" label="Settings" />
    </div>
  ),
};
