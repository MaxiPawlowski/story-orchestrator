import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { ChapterRecordControls } from "./ChapterRecordControls";

const meta: Meta<typeof ChapterRecordControls> = {
  title: "Settings/ChapterRecordControls",
  component: ChapterRecordControls,
  args: { stored: undefined, onWrite: fn() },
};

export default meta;

type Story = StoryObj<typeof ChapterRecordControls>;

export const OffByDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Chapter records"));
    await expect(canvas.getByLabelText("Write a record when a chapter ends")).not.toBeChecked();
    await expect(canvas.getByLabelText("Add the story so far to every prompt")).not.toBeChecked();
    await expect(canvas.getByLabelText(/Leave ended chapters' messages out/)).not.toBeChecked();
    await expect(canvas.getByLabelText("Story so far budget")).toHaveValue("700");
  },
};

export const SwitchOnAndPickAnArm: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Chapter records"));
    await userEvent.click(canvas.getByLabelText("Write a record when a chapter ends"));
    await expect(args.onWrite).toHaveBeenCalledWith({ seal: true });
    await userEvent.selectOptions(canvas.getByLabelText("Story so far budget"), "400");
    await expect(args.onWrite).toHaveBeenLastCalledWith({ chronicleTokens: 400 });
  },
};
