import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { JournalPanel } from "./JournalPanel";
import { emptyGame, sampleAuthor, sampleGame } from "../widgets/gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof JournalPanel> = {
  title: "Panels/JournalPanel",
  component: JournalPanel,
  args: { game: sampleGame() },
};

export default meta;

type Story = StoryObj<typeof JournalPanel>;

export const PlayerJournal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The ferryman's debt")).toBeVisible();
    await expect(canvas.getByText("First crossing")).toBeVisible();
    await expect(canvasElement.querySelector('[data-so="journal-author"]')).toBeNull();
  },
};

export const Empty: Story = {
  args: { game: emptyGame() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Nothing to show yet. Quests appear here once you find them.")).toBeVisible();
  },
};

export const AuthorView: Story = {
  args: { author: sampleAuthor() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/The smuggler's map \(smuggler\)/)).toBeVisible();
    await expect(canvas.getByText(/quest_smuggler_found/)).toBeVisible();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-journal");

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
