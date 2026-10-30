import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { MemoryEntry } from "@memory/index";
import { memoryPeek } from "@runtime/storySheet";
import { MemoryTab } from "./MemoryTab";
import { fitsAt, VIEWPORTS } from "../../../../.storybook/fit";

const shown = [
  { id: "m1", text: "The sun-key opens the inner sanctum.", tier: "facts", createdAt: 1 },
  { id: "m2", text: "The guild master warned you.", tier: "facts", createdAt: 2, pinned: true },
  { id: "m3", text: "An old claim.", tier: "facts", createdAt: 3, supersededBy: "m1" },
] as unknown as MemoryEntry[];

const meta: Meta<typeof MemoryTab> = {
  title: "Panels/Sheet/MemoryTab",
  component: MemoryTab,
  args: { entries: memoryPeek({ memoryShown: shown }), onOpenMemory: fn() },
};

export default meta;

type Story = StoryObj<typeof MemoryTab>;

export const Peek: Story = {
  play: async ({ args, canvasElement }) => {
    const rows = [...canvasElement.querySelectorAll('[data-so="hud-card-memory"]')].map((row) => row.textContent);
    await expect(rows).toEqual(["The guild master warned you.", "The sun-key opens the inner sanctum."]);
    await expect(canvasElement.textContent).not.toMatch(/old claim/);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open memory" }));
    await expect(args.onOpenMemory).toHaveBeenCalledTimes(1);
  },
};

export const Empty: Story = {
  args: { entries: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Nothing remembered yet.")).toBeVisible();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-sheet-memory-peek");

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
