import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { JournalPanel } from "./JournalPanel";
import { emptyGame, noticedLines, noticingGame, sampleAuthor, sampleGame } from "../widgets/gameViewFixtures";
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

export const NoticedEmpty: Story = {
  args: { game: noticingGame([]) },
  play: async ({ canvasElement }) => {
    const section = canvasElement.querySelector('[data-so="journal-noticed"]') as HTMLElement;
    await expect(within(section).getByText("Nothing noticed yet.")).toBeVisible();
    await expect(canvasElement.querySelector('[data-so="journal-empty"]')).toBeNull();
  },
};

export const NoticedOne: Story = {
  args: { game: noticingGame(noticedLines().slice(1, 2)), onJump: fn() },
  play: async ({ args, canvasElement }) => {
    const section = canvasElement.querySelector('[data-so="journal-noticed"]') as HTMLElement;
    await expect(within(section).getByText("A thin line of salt crusts the hem of the coat.")).toBeVisible();
    await expect(within(section).getByText("From Tom")).toBeVisible();
    await userEvent.click(within(section).getByRole("button", { name: "Show in chat" }));
    await expect(args.onJump).toHaveBeenCalledWith(8);
  },
};

export const NoticedMany: Story = {
  args: { game: noticingGame() },
  play: async ({ canvasElement }) => {
    const rows = [...canvasElement.querySelectorAll('[data-so="journal-noticed-line"]')];
    await expect(rows).toHaveLength(3);
    await expect(within(rows[0] as HTMLElement).getByText("At The landing")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="journal-noticed-jump"]')).toHaveLength(3);
    await expect(canvasElement.querySelector('[data-so="journal-noticed"]')?.textContent).not.toMatch(/obs_|missed|d6|roll|"id"/);
  },
};

const noticed = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="journal-noticed"]');

export const NoticedPhone: Story = { args: { game: noticingGame() }, ...fitsAt(VIEWPORTS.phone, noticed) };

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-journal");

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
