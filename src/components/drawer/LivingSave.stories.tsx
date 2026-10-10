import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { LivingSave } from "./LivingSave";

const meta: Meta<typeof LivingSave> = {
  title: "Drawer/LivingSave",
  component: LivingSave,
};

export default meta;

type Story = StoryObj<typeof LivingSave>;

export const SavesTheRun: Story = {
  args: { onSave: fn(async () => ({ ok: true, title: "Lantern Coast (played)", excluded: 2 })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Save this run as a story" }));
    await expect(args.onSave).toHaveBeenCalled();
    const result = await canvas.findByText("Saved “Lantern Coast (played)” to the library.", { exact: false });
    await expect(result).toHaveTextContent("2 turning point(s) you never reached were left out.");
    await expect(canvasElement).not.toHaveTextContent("checkpoint");
  },
};

export const SaysWhyItRefused: Story = {
  args: { onSave: fn(async () => ({ ok: false, reason: "the chat changed before the story was saved" })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Save this run as a story" }));
    await expect(await canvas.findByText("Not saved: the chat changed before the story was saved.")).toBeInTheDocument();
  },
};
