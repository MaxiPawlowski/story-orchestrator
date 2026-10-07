import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { StatSheetPanel } from "./StatSheetPanel";
import { sampleGame } from "../widgets/gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof StatSheetPanel> = {
  title: "Panels/StatSheetPanel",
  component: StatSheetPanel,
  args: { sheet: sampleGame().statSheet },
};

export default meta;

type Story = StoryObj<typeof StatSheetPanel>;

export const Groups: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Resolve")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="sheet-group"]')).toHaveLength(2);
  },
};

export const Empty: Story = {
  args: { sheet: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Nothing to show yet.")).toBeVisible();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-stat-sheet");

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
