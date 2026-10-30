import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { SettingRow } from "./SettingRow";
import { Switch } from "./Switch";
import { SegmentedControl } from "./SegmentedControl";
import { Select } from "./Field";

type Notes = "off" | "story" | "author";
const NOTES = [{ value: "off" as Notes, label: "Off" }, { value: "story" as Notes, label: "Story" }, { value: "author" as Notes, label: "Author" }];

const Demo = () => {
  const [reading, setReading] = useState(true);
  const [notes, setNotes] = useState<Notes>("author");
  return (
    <div>
      <SettingRow label="Story reading" htmlFor="kit-reading" description="Reads replies to track facts and story progress." scope="story"
        help="A second model reads the chat after replies." changed={!reading} onReset={() => setReading(true)}
        control={(describedBy) => <Switch id="kit-reading" checked={reading} describedBy={describedBy} onChange={setReading} />} />
      <SettingRow label="Notes under replies" description="What appears under each reply." scope="device" changed={notes !== "story"} onReset={() => setNotes("story")}
        control={<SegmentedControl label="Notes under replies" value={notes} onChange={setNotes} options={NOTES} />} />
      <SettingRow label="Memory model" htmlFor="kit-model" description="Pick a fast, cheap model." scope="default"
        control={<Select id="kit-model" defaultValue="a"><option value="a">Local fast</option><option value="b">Remote</option></Select>} />
    </div>
  );
};

const meta = { title: "Kit/SettingRow", component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ResetOnlyWhenChanged: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reading = canvas.getByRole("switch", { name: "Story reading" });
    await expect(reading).toHaveAccessibleDescription("Reads replies to track facts and story progress.");
    await expect(canvas.queryByRole("button", { name: "Reset Story reading" })).toBeNull();
    await userEvent.click(reading);
    await expect(reading).not.toBeChecked();
    await userEvent.click(canvas.getByRole("button", { name: "Reset Story reading" }));
    await expect(reading).toBeChecked();
    await expect(canvas.queryByRole("button", { name: "Reset Story reading" })).toBeNull();
    await expect([...canvasElement.querySelectorAll("[data-so=setting-scope]")].map((chip) => chip.textContent)).toEqual(["Story", "This device", "Default"]);
    await userEvent.click(canvas.getByRole("button", { name: "Reset Notes under replies" }));
    await expect(canvas.getByRole("radio", { name: "Story" })).toBeChecked();
  },
};

export const Phone: Story = { parameters: { testViewport: { width: 390, height: 844 } } };
