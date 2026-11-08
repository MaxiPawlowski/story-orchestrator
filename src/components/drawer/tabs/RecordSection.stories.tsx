import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within, fn } from "@storybook/test";
import type { RecordView } from "@runtime/authorConsole";
import { RecordSection } from "./RecordSection";

const unknown = { miller: "unknown", boy: "unknown" } as const;

const view: RecordView = {
  rows: [
    { boundary: 3, messageId: 6, event: { kind: "quest", id: "rescue", to: "active" }, causes: [], effects: [], audience: { ...unknown }, opens: ["quest:rescue"], closes: [],
      label: "The miller's son: active" },
    { boundary: 5, messageId: 10, event: { kind: "resolution", id: "rescue", to: "freed" },
      causes: [{ key: "boy_free", value: true, playerSpan: { messageId: 9, revision: "r1", span: [0, 4] } }], effects: [], audience: { ...unknown }, opens: ["echo:e1"],
      closes: ["quest:rescue"], label: "The miller's son closed: Freed the boy" },
    { boundary: 5, messageId: 10, event: { kind: "consequence", id: "rescue:freed:thanks", to: "freed" }, causes: [], effects: ["wi-1"], audience: { ...unknown }, opens: [], closes: [],
      label: "The miller's son (freed): The miller paid" },
    { boundary: 7, messageId: 14, event: { kind: "echo", id: "gratitude" }, causes: [], effects: [], audience: { miller: "told", boy: "unknown" }, opens: [], closes: ["echo:e1"],
      label: "Echo gratitude landed" },
  ],
  open: [],
};

const meta: Meta<typeof RecordSection> = { title: "Drawer/RecordSection", component: RecordSection };
export default meta;
type Story = StoryObj<typeof RecordSection>;

export const Rows: Story = {
  args: { view, onJump: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const rows = canvasElement.querySelectorAll('[data-so="record-row"]');
    await expect(rows).toHaveLength(4);
    await expect(canvasElement.querySelector('[data-kind="resolution"]')).toHaveTextContent("Why: the player's line in message 9 (boy_free = true)");
    await expect(canvasElement.querySelector('[data-kind="consequence"]')).toHaveTextContent("Why: unknown · effects: 1");
    await expect(canvasElement.querySelector('[data-kind="echo"]')).toHaveTextContent("told: miller");
    await userEvent.click(canvas.getAllByRole("button", { name: "Turn 5" })[0]);
    await expect(args.onJump).toHaveBeenCalledWith(10);
  },
};

export const StillOpen: Story = {
  args: { view: { rows: view.rows.slice(0, 1), open: ["quest:rescue"] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="record-open"]')).toHaveTextContent("quest:rescue");
  },
};

export const Off: Story = {
  args: { view: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent("The story record is off");
  },
};
