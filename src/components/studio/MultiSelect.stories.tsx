import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import MultiSelect, { type Option } from "./MultiSelect";

const OPTIONS: Option[] = [
  { value: "alpha", label: "Lorebook Alpha" },
  { value: "beta", label: "Lorebook Beta" },
  { value: "secret", label: "Companion Secret" },
  { value: "gate", label: "Ancient Gate" },
];

const Demo = ({ options, initial }: { options: Option[]; initial: string[] }) => {
  const [value, setValue] = useState<string[]>(initial);
  return <MultiSelect options={options} value={value} onChange={setValue} />;
};

const meta: Meta<typeof Demo> = {
  title: "Studio/Primitives/MultiSelect",
  component: Demo,
  args: { options: OPTIONS, initial: [] },
};

export default meta;

type Story = StoryObj<typeof Demo>;

export const Empty: Story = {};

export const Preselected: Story = {
  args: { initial: ["alpha", "gate"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("2 selected")).toBeInTheDocument();
  },
};

export const FilterAndSelect: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText("Search…"), "Alpha");
    await userEvent.click(canvas.getByText("Lorebook Alpha"));
    await expect(canvas.getByText("1 selected")).toBeInTheDocument();
  },
};
