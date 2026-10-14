import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { PlayerPromises } from "./PlayerPromises";

const meta: Meta<typeof PlayerPromises> = {
  title: "Drawer/PlayerPromises",
  component: PlayerPromises,
  render: (args) => <div style={{ maxWidth: 360 }}><PlayerPromises {...args} /></div>,
  args: {
    promises: [
      { id: "p1", promisee: "Mara", quote: "I promise I'll bring your brother home", deadline: "by the new moon" },
      { id: "p2", promisee: "Kael", quote: "You have my word, I'll find the ledger", questTitle: "The missing ledger" },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof PlayerPromises>;

export const VerifiedQuotes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Your promises")).toBeInTheDocument();
    await expect(canvas.getByText("To Mara")).toBeInTheDocument();
    await expect(canvas.getByText(/I promise I'll bring your brother home/)).toBeInTheDocument();
    await expect(canvas.getByText('agreed: "by the new moon"')).toBeInTheDocument();
    await expect(canvas.getByText("followed by The missing ledger")).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-so="player-promise"]').length).toBe(2);
  },
};

export const OnePromise: Story = {
  args: { promises: [{ id: "p3", promisee: "Ilsa", quote: "I swear I will come back for you" }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("To Ilsa")).toBeInTheDocument();
    await expect(canvasElement.querySelector(".text-xs")).toBeNull();
  },
};
