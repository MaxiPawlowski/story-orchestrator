import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import type { RumorAuthorRow } from "@memory/rumors/lines";
import { RumorsPanel } from "./RumorsPanel";

const rows: RumorAuthorRow[] = [
  { rumorId: "mill-fire", from: "Bryn", to: "Bryn", hop: 0, version: "the old mill burned down", status: "origin", leak: false, due: "turn 2" },
  { rumorId: "mill-fire", from: "Bryn", to: "Tam", hop: 1, version: "someone set the old mill ablaze", status: "landed", stance: "doubts", leak: false, due: "turn 3" },
  { rumorId: "mill-fire", from: "Tam", to: "Ula", hop: 2, version: "the old mill burned down", status: "pending", leak: false, due: "turn 5" },
  { rumorId: "vault-key", from: "Kel", to: "Cora", hop: 1, version: "Kel carries a key to the vault", status: "landed", stance: "unsure", leak: true, due: "turn 4" },
];

const meta: Meta<typeof RumorsPanel> = {
  title: "Drawer/RumorsPanel",
  component: RumorsPanel,
};

export default meta;

type Story = StoryObj<typeof RumorsPanel>;

export const HopsLandedAndPending: Story = {
  args: { rows },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Rumors (2 heard, 1 on the way)"));
    await expect(canvasElement.querySelector('[data-status="landed"][data-rumor="mill-fire"]')).toHaveTextContent("Bryn → Tam (hop 1) · heard, doubts it");
    await expect(canvasElement.querySelector('[data-status="pending"]')).toHaveTextContent("due turn 5");
    await expect(canvasElement.querySelector('[data-rumor="vault-key"]')).toHaveTextContent("leak");
    await expect(canvasElement.querySelector('[data-status="origin"]')).toHaveTextContent("started with Bryn");
  },
};

export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="rumors"]')).toBeNull();
  },
};
