import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import { Dialog, DialogHeader, type DialogSize } from "./Dialog";
import { Button } from "./Button";
import { SettingRow } from "./SettingRow";
import { Switch } from "./Switch";

const Demo = ({ size = "window" }: { size?: DialogSize }) => {
  const [open, setOpen] = useState(true);
  const [on, setOn] = useState(true);
  if (!open) return <Button onClick={() => setOpen(true)}>Open dialog</Button>;
  return (
    <Dialog id="kit-dialog" size={size} aria-labelledby="kit-dialog-title" onClose={() => setOpen(false)}
      onCancel={(event) => { event.preventDefault(); setOpen(false); }}>
      <div className={size === "full" ? "so-dialog-frame" : undefined}>
        <DialogHeader titleId="kit-dialog-title" title="Factions lab" subtitle="This chat · Player view" onClose={() => setOpen(false)} closeLabel="Close the demo" />
        <div className="so-dialog-body">
          <SettingRow label="Story reading" htmlFor="kit-dialog-switch" description="Reads replies to track facts." control={<Switch id="kit-dialog-switch" checked={on} onChange={setOn} />} />
        </div>
      </div>
    </Dialog>
  );
};

const meta = {
  title: "Kit/Dialog",
  component: Demo,
  parameters: { docs: { description: { component: "Native <dialog> opened with showModal() (top layer, so ST's translateZ containing block does not apply). One header: title, subtitle, close IconButton. full = viewport with a centred ~1200px frame; window = centred card; sheet = right dock. All three go full-screen or bottom-docked under 700px." } } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Window: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = canvasElement.querySelector<HTMLDialogElement>("#kit-dialog");
    await waitFor(() => expect(dialog?.open).toBe(true));
    await expect(dialog).toHaveAttribute("data-size", "window");
    await expect(canvas.getByRole("heading", { name: "Factions lab" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Close the demo" }));
    await expect(await canvas.findByRole("button", { name: "Open dialog" })).toBeInTheDocument();
  },
};

export const Full: Story = { args: { size: "full" } };

export const Sheet: Story = { args: { size: "sheet" } };

export const Phone: Story = { parameters: { testViewport: { width: 390, height: 844 } } };
