import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { ReplyThinkingField } from "./ReplyThinkingField";

const meta: Meta<typeof ReplyThinkingField> = {
  title: "Settings/ReplyThinkingField",
  component: ReplyThinkingField,
};

export default meta;

type Story = StoryObj<typeof ReplyThinkingField>;

export const DefaultIsMedium: Story = {
  args: { value: undefined, onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByLabelText("Reply thinking");
    await expect(select).toHaveAttribute("id", "so-reply-effort");
    await expect(select).toHaveValue("medium");
    await expect(canvas.getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["off", "low", "medium", "high"]);
    await userEvent.selectOptions(select, "low");
    await expect(args.onChange).toHaveBeenCalledWith("low");
  },
};

export const StoredHigh: Story = {
  args: { value: "high", onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const select = within(canvasElement).getByLabelText("Reply thinking");
    await expect(select).toHaveValue("high");
    await userEvent.selectOptions(select, "off");
    await expect(args.onChange).toHaveBeenCalledWith("off");
  },
};
