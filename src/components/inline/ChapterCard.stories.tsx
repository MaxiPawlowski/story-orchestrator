import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { ChapterCard } from "./ChapterCard";

const meta: Meta<typeof ChapterCard> = {
  title: "Inline/ChapterCard",
  component: ChapterCard,
  args: { card: { messageId: 6, chapterId: "siege", title: "The Siege", number: 2, interlude: false, final: false } },
};

export default meta;

type Story = StoryObj<typeof ChapterCard>;

export const Chapter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The Siege")).toBeInTheDocument();
    await expect(canvas.getByText("Chapter 2")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="chapter-card-briefing"]')).toBeNull();
    await expect(canvasElement.textContent).not.toContain("siege");
  },
};

export const WithBriefing: Story = {
  args: { card: { messageId: 6, chapterId: "siege", title: "The Siege", number: 2, interlude: false, final: true, briefing: { title: "The Siege", image: null, tone: "Cold, tense", sections: [{ heading: "Your watch", text: "The walls hold for one more night. Choose who stands watch." }], startLabel: "Begin", source: "authored", chapterId: "siege" } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Final chapter")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="chapter-card-briefing"]')?.textContent).toContain("one more night");
    await expect(canvas.getByText("Your watch")).toBeInTheDocument();
    await expect(canvas.getByText("Cold, tense")).toBeInTheDocument();
  },
};

export const Interlude: Story = {
  args: { card: { messageId: 4, chapterId: "camp", title: "Night Camp", number: null, interlude: true, final: false } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Interlude")).toBeInTheDocument();
  },
};
