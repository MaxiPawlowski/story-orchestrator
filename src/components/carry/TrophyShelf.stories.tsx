import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { ContinueRow } from "@runtime/playsIndex";
import type { TrophyRow } from "@runtime/carryPort";
import { TrophyShelf } from "./TrophyShelf";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const rows: ContinueRow[] = [
  { chatId: "c1", storyId: "lanterns", title: "Lanterns", groupId: "g", checkpointName: "The tower", kind: "story", ended: true, updatedAt: "2026-10-01T00:00:00.000Z" },
  { chatId: "c2", storyId: "lanterns", title: "Lanterns", groupId: "g", checkpointName: "The quay", kind: "story", updatedAt: "2026-10-02T00:00:00.000Z" },
];

const trophies: TrophyRow[] = [
  { chatId: "c1", storyTitle: "Lanterns", endingTitle: "The Last Lantern", endedAt: "2026-10-01T00:00:00.000Z", milestones: ["Relit the harbour light", "Came away with coin"] },
];

const meta: Meta<typeof TrophyShelf> = {
  title: "Settings/TrophyShelf",
  component: TrophyShelf,
  args: { rows, load: fn(async () => trophies), onOpen: fn() },
};

export default meta;

type Story = StoryObj<typeof TrophyShelf>;

export const VerifiedRuns: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(args.load).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByText("Finished stories"));
    await expect(await canvas.findByText("Lanterns — ended with “The Last Lantern”")).toBeVisible();
    await expect(args.load).toHaveBeenCalledTimes(1);
    await expect(canvasElement.querySelectorAll('[data-so="trophy-milestone"]')).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Open Lanterns" }));
    await expect(args.onOpen).toHaveBeenCalledWith(rows[0]);
  },
};

export const NoneReadable: Story = {
  args: { load: fn(async () => []) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Finished stories"));
    await expect(await canvas.findByText("None of your finished runs could be read.")).toBeVisible();
  },
};

export const NothingEnded: Story = {
  args: { rows: [rows[1]] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="trophy-shelf"]')).toBeNull();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="trophy-shelf"] summary');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
