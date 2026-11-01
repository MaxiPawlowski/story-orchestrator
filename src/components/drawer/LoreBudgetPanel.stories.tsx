import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import type { LoreBudgetView } from "@runtime/loreBudget";
import { LoreBudgetPanel } from "./LoreBudgetPanel";

const view: LoreBudgetView = {
  chatId: "c1", scans: 6, consumer: "World Atlas", cap: 0, storyTokens: 4200,
  starved: [{ book: "Harbour Lore", uid: 3, comment: "Harbour master", via: "forced", count: 3 }],
  lastCut: [{ book: "Harbour Lore", uid: 3, comment: "Harbour master", via: "forced" }, { book: "Harbour Lore", uid: 7, comment: "Tides", via: "story" }],
};

const meta: Meta<typeof LoreBudgetPanel> = {
  title: "Drawer/LoreBudgetPanel",
  component: LoreBudgetPanel,
};

export default meta;

type Story = StoryObj<typeof LoreBudgetPanel>;

export const EntriesCut: Story = {
  args: { view },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Cut by budget" })).toBeInTheDocument();
    await expect([...canvasElement.querySelectorAll('[data-so="lore-budget-row"]')].map((row) => row.getAttribute("data-via"))).toEqual(["forced", "story"]);
    await expect(canvas.getByText(/Budget cap: none/)).toBeInTheDocument();
  },
};

export const NothingCut: Story = {
  args: { view: { ...view, lastCut: [], starved: [] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="lore-budget-none"]')).not.toBeNull();
  },
};

export const NoEvidence: Story = {
  args: { view: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="lore-budget"]')).toBeNull();
  },
};
