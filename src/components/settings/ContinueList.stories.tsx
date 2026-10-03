import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { ContinueList } from "./ContinueList";

const NOW = Date.parse("2026-10-03T12:00:00.000Z");

const meta: Meta<typeof ContinueList> = {
  title: "Settings/ContinueList",
  component: ContinueList,
  args: {
    now: NOW,
    onOpen: fn(),
    rows: [
      { chatId: "chat-b", storyId: "sun", title: "Sun Ruins", groupId: "g1", checkpointName: "The Gate", chapterTitle: "The Siege", kind: "saga", updatedAt: "2026-10-03T11:30:00.000Z" },
      { chatId: "chat-a", storyId: "moon", title: "Moon Well", groupId: "g2", checkpointName: null, kind: "story", updatedAt: "2026-10-01T12:00:00.000Z" },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof ContinueList>;

export const YourStories: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-so="continue-row"]')];
    await expect(rows.map((row) => row.dataset.kind)).toEqual(["saga", "story"]);
    await expect(rows[0].textContent).toContain("The Siege · The Gate · 30 minutes ago");
    await expect(rows[1].textContent).toContain("2 days ago");
    await userEvent.click(canvas.getByRole("button", { name: "Open Moon Well" }));
    await expect(args.onOpen).toHaveBeenCalledWith(expect.objectContaining({ chatId: "chat-a", groupId: "g2" }));
  },
};

export const OpenNow: Story = {
  args: { openChatId: "chat-b" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Open Sun Ruins" })).toBeDisabled();
  },
};

export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="continue-empty"]')).not.toBeNull();
  },
};
