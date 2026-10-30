import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { SegmentedControl } from "./SegmentedControl";

type Level = "0" | "1" | "2" | "3";
const OPTIONS = [
  { value: "0" as Level, label: "Off" },
  { value: "1" as Level, label: "Story" },
  { value: "2" as Level, label: "Behind the scenes" },
  { value: "3" as Level, label: "Author" },
];

const Demo = () => {
  const [level, setLevel] = useState<Level>("1");
  return (
    <div className="so-section">
      <SegmentedControl label="Notes under replies" value={level} options={OPTIONS} onChange={setLevel} />
      <span data-so="value">{level}</span>
    </div>
  );
};

const meta = { title: "Kit/SegmentedControl", component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LabelsAndArrows: Story = {
  play: async ({ canvasElement }) => {
    const group = within(within(canvasElement).getByRole("radiogroup", { name: "Notes under replies" }));
    const value = () => canvasElement.querySelector("[data-so=value]");
    await expect(group.getByRole("radio", { name: "Story" })).toBeChecked();
    await expect(group.getByRole("radio", { name: "Story" })).toHaveAttribute("tabindex", "0");
    await userEvent.click(group.getByRole("radio", { name: "Author" }));
    await expect(value()).toHaveTextContent("3");
    await userEvent.keyboard("{ArrowRight}");
    await expect(group.getByRole("radio", { name: "Off" })).toBeChecked();
    await expect(group.getByRole("radio", { name: "Off" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(group.getByRole("radio", { name: "Author" })).toBeChecked();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(value()).toHaveTextContent("2");
  },
};
