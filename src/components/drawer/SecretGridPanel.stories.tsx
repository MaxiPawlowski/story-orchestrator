import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import type { SecretGridView } from "@runtime/whoKnows";
import { SecretGridPanel } from "./SecretGridPanel";

const grid: SecretGridView = {
  members: [{ id: "arin", name: "Arin", onStage: true }, { id: "luke", name: "Luke", onStage: false }, { id: "sphinx", name: "Sphinx", onStage: true }],
  rows: [
    { id: "e1", holder: "Sphinx", tag: "hiding", text: "The sun-key is a forgery made by the wardens.", cells: { arin: "kept-out", luke: "not-told", sphinx: "knows" } },
    { id: "e2", holder: "Luke", tag: "unaware", text: "Luke's brother sold the map to the wardens last winter.", cells: { arin: "knows", luke: "kept-out", sphinx: "knows" } },
  ],
  alerts: [{ secretId: "e1", memberId: "arin", name: "Arin", text: "The sun-key is a forgery made by the wardens." }],
};

const meta: Meta<typeof SecretGridPanel> = {
  title: "Drawer/SecretGridPanel",
  component: SecretGridPanel,
};

export default meta;

type Story = StoryObj<typeof SecretGridPanel>;

export const GridWithAnAlert: Story = {
  args: { grid },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Who knows what" })).toBeInTheDocument();
    const rows = [...canvasElement.querySelectorAll('[data-so="who-knows-row"]')].map((row) =>
      [...row.querySelectorAll('[data-so="who-knows-cell"]')].map((cell) => cell.getAttribute("data-state")));
    await expect(rows).toEqual([["kept-out", "not-told", "knows"], ["knows", "kept-out", "knows"]]);
    await expect(canvasElement.querySelectorAll('[data-so="secret-on-stage-row"]')).toHaveLength(1);
    await expect(canvas.getByText(/Arin is on stage and kept out of a secret/)).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-so="who-knows-member"][data-on-stage="true"]')).toHaveLength(2);
  },
};

export const NoSecretHeld: Story = {
  args: { grid: { members: grid.members, rows: [], alerts: [] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="who-knows-empty"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-so="secret-on-stage"]')).toBeNull();
  },
};
