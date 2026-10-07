import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { WidgetCard } from "./WidgetCard";
import { boardWidget, clockWidget, sampleGame } from "./gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof WidgetCard> = {
  title: "Panels/WidgetCard",
  component: WidgetCard,
  args: { widget: sampleGame().journal[0] },
};

export default meta;

type Story = StoryObj<typeof WidgetCard>;

export const Track: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("The ferryman's debt")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="quest"]')).toHaveLength(3);
  },
};

export const Clock: Story = {
  args: { widget: clockWidget },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("img", { name: "Alarm: 4 of 6" })).toBeVisible();
  },
};

export const Board: Story = {
  args: { widget: boardWidget },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-so="board-lane"]')).toHaveLength(3);
  },
};

export const Meters: Story = { args: { widget: sampleGame().statSheet ?? clockWidget } };

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="widget"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
