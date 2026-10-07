import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { StoryPlayer } from "@engine/index";
import { PlayerEditor } from "./PlayerEditor";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const Harness = ({ initial, onChange }: { initial?: StoryPlayer; onChange: (next: StoryPlayer | undefined) => void }) => {
  const [player, setPlayer] = useState(initial);
  return <PlayerEditor player={player} onChange={(next) => { setPlayer(next); onChange(next); }} />;
};

const meta: Meta<typeof Harness> = {
  title: "Studio/PlayerEditor",
  component: Harness,
  args: { onChange: fn() },
};

export default meta;

type Story = StoryObj<typeof Harness>;

export const Empty: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Player role"), "a courier");
    await expect(args.onChange).toHaveBeenLastCalledWith({ role: "a courier" });
    await expect(canvasElement.querySelector('[data-so="player-line"]')).toHaveTextContent("In this story, {{user}} is a courier.");
    await userEvent.click(canvas.getByRole("button", { name: "+ Assumption" }));
    await userEvent.type(canvas.getByLabelText("Assumption 1"), "can ride");
    await expect(args.onChange).toHaveBeenLastCalledWith({ role: "a courier", assumes: ["can ride"] });
  },
};

export const FixedNameNoInject: Story = {
  args: { initial: { role: "a courier", name: { mode: "fixed", value: "Mara" }, inject: false } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Player name")).toHaveValue("Mara");
    await expect(canvasElement.querySelector('[data-so="player-line"]')).toBeNull();
    await userEvent.click(canvas.getByLabelText("Tell the characters who the player is"));
    await expect(args.onChange).toHaveBeenLastCalledWith({ role: "a courier", name: { mode: "fixed", value: "Mara" } });
  },
};

const editor = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="player-editor"]');

export const Phone: Story = { ...fitsAt(VIEWPORTS.phone, editor) };
export const Tablet: Story = { ...fitsAt(VIEWPORTS.tablet, editor) };
export const Desktop: Story = { ...fitsAt(VIEWPORTS.wide, editor) };
