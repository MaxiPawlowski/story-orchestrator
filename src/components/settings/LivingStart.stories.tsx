import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { LivingStart } from "./LivingStart";

const meta: Meta<typeof LivingStart> = {
  title: "Settings/LivingStart",
  component: LivingStart,
};

export default meta;

type Story = StoryObj<typeof LivingStart>;

export const StartFromAPremise: Story = {
  args: { busy: false, onStart: fn(async () => true) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Start from a premise" }));
    const go = canvas.getByRole("button", { name: "Start the story" });
    await expect(go).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("Title"), "Lantern Coast");
    await userEvent.type(canvas.getByLabelText("Premise"), "The harbour lanterns go out one by one each night.");
    await userEvent.type(canvas.getByLabelText("Tone (optional)"), "quiet");
    await expect(go).toBeEnabled();
    await userEvent.click(go);
    await expect(args.onStart).toHaveBeenCalledWith({ title: "Lantern Coast", premise: "The harbour lanterns go out one by one each night.", tone: "quiet", playerRole: "" });
    await expect(await canvas.findByText("Started. The story writes its next turning point as you play.")).toBeInTheDocument();
  },
};

export const RefusedStart: Story = {
  args: { busy: false, onStart: fn(async () => false) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Start from a premise" }));
    await userEvent.type(canvas.getByLabelText("Premise"), "A miller's road where a flood took the bridge.");
    await userEvent.click(canvas.getByRole("button", { name: "Start the story" }));
    await expect(await canvas.findByText("Not started. The status line above says why.")).toBeInTheDocument();
  },
};
