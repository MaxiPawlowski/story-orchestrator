import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import SpriteRenderControls, { useRenderControls } from "./SpriteRenderControls";

function Controls({ busy }: { busy: boolean }) {
  return <SpriteRenderControls controls={useRenderControls()} busy={busy} />;
}

const meta: Meta<typeof Controls> = { title: "Studio/SpriteRenderControls", component: Controls, args: { busy: false } };
export default meta;
type Story = StoryObj<typeof Controls>;

export const StandardThenFast: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const preset = canvas.getByRole("combobox", { name: "Render preset" });
  await userEvent.selectOptions(preset, "fast");
  await expect(canvas.getByRole("combobox", { name: "Edit resolution" })).toHaveValue("512");
  await expect(canvas.getByRole("spinbutton")).toHaveValue(20);
  await userEvent.selectOptions(preset, "standard");
  await expect(canvas.getByRole("combobox", { name: "Edit resolution" })).toHaveValue("1024");
  await expect(canvas.getByRole("spinbutton")).toHaveValue(25);
} };

export const Busy: Story = { args: { busy: true }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).getByRole("combobox", { name: "Render preset" })).toBeDisabled();
} };
