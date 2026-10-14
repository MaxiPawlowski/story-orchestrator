import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { ChapterCard } from "./ChapterCard";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

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
  args: {
    card: {
      messageId: 6, chapterId: "siege", title: "The Siege", number: 2, interlude: false, final: true,
      briefing: {
        title: "The Siege", image: null, tone: "Cold, tense", startLabel: "Begin", source: "authored", chapterId: "siege",
        sections: [{ heading: "Your watch", text: "The walls hold for one more night. Choose who stands watch." }],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Final chapter")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="chapter-card-briefing"]')?.textContent).toContain("one more night");
    await expect(canvas.getByText("Your watch")).toBeInTheDocument();
    await expect(canvas.getByText("Cold, tense")).toBeInTheDocument();
  },
};

const longCard = {
  args: {
    card: {
      messageId: 6, chapterId: "siege", title: "The Siege of the Northern Watchtowers and the Long Night", number: 2, interlude: false, final: true,
      briefing: {
        title: "The Siege", image: null, tone: "Cold, tense", startLabel: "Begin", source: "authored" as const, chapterId: "siege",
        sections: [{ heading: "Your watch", text: "The walls hold for one more night. Choose who stands watch on the eastern parapet, and who sleeps." }],
      },
    },
  },
};
const chapterTitle = (canvasElement: HTMLElement) => within(canvasElement).getByText(/The Siege of the Northern Watchtowers/);

export const Phone: Story = { ...longCard, ...fitsAt(VIEWPORTS.phone, chapterTitle) };
export const Tablet: Story = { ...longCard, ...fitsAt(VIEWPORTS.tablet, chapterTitle) };
export const Wide: Story = { ...longCard, ...fitsAt(VIEWPORTS.wide, chapterTitle) };

export const WithRecap: Story = {
  args: {
    card: {
      messageId: 6, chapterId: "siege", title: "The Siege", number: 2, interlude: false, final: false,
      recap: { label: "Because of you", lines: ["The garrison opened its gates.", "Reached The Gatehouse, because you took the posting.", "Milestone: First Blood"] },
    },
  },
  play: async ({ canvasElement }) => {
    const recap = canvasElement.querySelector('[data-so="chapter-card-recap"]');
    await expect(recap?.textContent).toContain("Because of you");
    await expect(recap?.querySelectorAll("li").length).toBe(3);
    await expect(within(canvasElement).getByText("The Siege")).toBeInTheDocument();
  },
};

export const RecapPhone: Story = {
  args: {
    card: {
      messageId: 6, chapterId: "siege", title: "The Siege", number: 2, interlude: false, final: false,
      recap: { label: "What changed", lines: ["Quest complete: The Long Watch of the Northern Towers and Every Gate Between", "Reached The Gatehouse"] },
    },
  },
  ...fitsAt(VIEWPORTS.phone, (canvasElement: HTMLElement) => within(canvasElement).getByText(/The Long Watch/)),
};

export const Interlude: Story = {
  args: { card: { messageId: 4, chapterId: "camp", title: "Night Camp", number: null, interlude: true, final: false } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Interlude")).toBeInTheDocument();
  },
};
