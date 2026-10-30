import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { Switch } from "./Switch";

const Demo = ({ initial = false, disabled = false }: { initial?: boolean; disabled?: boolean }) => {
  const [on, setOn] = useState(initial);
  return (
    <div className="so-toolbar">
      <label htmlFor="kit-switch">Story reading</label>
      <Switch id="kit-switch" checked={on} disabled={disabled} onChange={setOn} />
    </div>
  );
};

const meta = { title: "Kit/Switch", component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Toggles: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole("switch", { name: "Story reading" });
    await expect(control).not.toBeChecked();
    await userEvent.click(control);
    await expect(control).toBeChecked();
    await userEvent.click(canvas.getByText("Story reading"));
    await expect(control).not.toBeChecked();
    control.focus();
    await userEvent.keyboard(" ");
    await expect(control).toBeChecked();
  },
};

export const Disabled: Story = {
  args: { initial: true, disabled: true },
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole("switch");
    await expect(control).toBeDisabled();
    await expect(control).toBeChecked();
  },
};
