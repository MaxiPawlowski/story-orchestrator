import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { BecauseRibbon } from "./BecauseRibbon";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof BecauseRibbon> = {
  title: "Inline/InChat/BecauseRibbon",
  component: BecauseRibbon,
  args: { messageId: 4, lines: ["Reached The Yard, because you set the watch."] },
};

export default meta;

type Story = StoryObj<typeof BecauseRibbon>;

export const OneLine: Story = {
  play: async ({ canvasElement }) => {
    const lines = [...canvasElement.querySelectorAll('[data-so="because-line"]')];
    await expect(lines.map((line) => line.textContent)).toEqual(["Reached The Yard, because you set the watch."]);
  },
};

export const TwoLines: Story = {
  args: { lines: ["Because you took the posting, the gatehouse let you in.", "Quest done: The Night Watch, because you rang the bell."] },
};

export const Abstains: Story = {
  args: { lines: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="because-ribbon"]')).toBeNull();
  },
};

const ribbon = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="because-ribbon"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, ribbon);
export const Wide: Story = fitsAt(VIEWPORTS.wide, ribbon);
