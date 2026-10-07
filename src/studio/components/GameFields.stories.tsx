import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { JsonField, OptionalGate, TextField } from "./GameFields";
import { sampleStory } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof JsonField> = {
  title: "Studio/GameFields",
  component: JsonField,
  args: { label: "Reward", value: { label: "Free passage" }, onChange: fn() },
};

export default meta;

type Story = StoryObj<typeof JsonField>;

export const JsonCommitsOnBlur: Story = {
  play: async ({ canvasElement, args }) => {
    const field = within(canvasElement).getByLabelText("Reward");
    await userEvent.clear(field);
    await userEvent.tab();
    await expect(args.onChange).toHaveBeenCalledWith(undefined);
  },
};

const gateChange = fn();

export const OptionalGateToggles: Story = {
  render: () => <OptionalGate label="Visible when" gate={undefined} qualities={sampleStory().qualities} onChange={gateChange} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByLabelText("Visible when"));
    await expect(gateChange).toHaveBeenCalledWith({ all: [] });
  },
};

export const Text: Story = {
  render: () => <TextField label="Title" value="The ferryman's debt" onChange={fn()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("Title")).toHaveValue("The ferryman's debt");
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector("textarea");

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
