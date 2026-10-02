import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent } from "@storybook/test";
import { StoryLoreGlobal } from "./StoryLoreGlobal";

const meta: Meta<typeof StoryLoreGlobal> = {
  title: "Settings/StoryLoreGlobal",
  component: StoryLoreGlobal,
  args: { books: [], busy: false, onRelease: fn(), onKeep: fn() },
};

export default meta;

type Story = StoryObj<typeof StoryLoreGlobal>;

export const NothingSelected: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-story-lore-global")).toBeNull();
  },
};

export const StoryBooksSelectedGlobally: Story = {
  args: { books: ["The Hoard of the Dead Dragon", "Adolion World"] },
  play: async ({ canvasElement, args }) => {
    const row = canvasElement.querySelector("#so-story-lore-global") as HTMLElement;
    await expect(row.textContent).toContain("2 story lorebooks are switched on for every chat");
    await expect(row.textContent).toContain("The Hoard of the Dead Dragon, Adolion World");
    await userEvent.click(canvasElement.querySelector("#so-story-lore-release") as HTMLElement);
    await expect(args.onRelease).toHaveBeenCalledTimes(1);
    await userEvent.click(canvasElement.querySelector("#so-story-lore-keep") as HTMLElement);
    await expect(args.onKeep).toHaveBeenCalledTimes(1);
  },
};

export const Busy: Story = {
  args: { books: ["The Hoard of the Dead Dragon"], busy: true },
  play: async ({ canvasElement }) => {
    await expect((canvasElement.querySelector("#so-story-lore-release") as HTMLButtonElement).disabled).toBe(true);
    await expect((canvasElement.querySelector("#so-story-lore-global") as HTMLElement).textContent).toContain("A story lorebook is switched on");
  },
};
