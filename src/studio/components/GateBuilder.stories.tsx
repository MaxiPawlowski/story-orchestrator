import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import type { GateNode } from "@engine/index";
import GateBuilder from "./GateBuilder";
import { sampleStory } from "../stories/fixtures";

const Demo = ({ initial }: { initial: GateNode }) => {
  const [gate, setGate] = useState<GateNode>(initial);
  return <GateBuilder gate={gate} qualities={sampleStory().qualities} onChange={setGate} />;
};

const meta: Meta<typeof Demo> = {
  title: "Studio/GateBuilder",
  component: Demo,
};

export default meta;

type Story = StoryObj<typeof Demo>;

export const Nested: Story = {
  args: { initial: { all: [{ q: "trust", op: ">=", v: 2 }, { not: { q: "alarm", op: "==", v: true } }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("trust >= 2 AND NOT (alarm == true)")).toBeInTheDocument();
  },
};

export const BuildCondition: Story = {
  args: { initial: { all: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Condition" }));
    await expect(canvas.getByText("trust == 0")).toBeInTheDocument();
  },
};

export const ToggleOperator: Story = {
  args: { initial: { all: [{ q: "trust", op: ">=", v: 2 }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("trust >= 2")).toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByLabelText("Group operator"), "any");
    await expect(canvas.getByText("(trust >= 2)")).toBeInTheDocument();
  },
};

export const EnumMembership: Story = {
  args: { initial: { all: [{ q: "route", op: "in", v: ["stealth"] }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('route in ["stealth"]')).toBeInTheDocument();
  },
};
