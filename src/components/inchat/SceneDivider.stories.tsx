import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { SceneDivider } from "./SceneDivider";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof SceneDivider> = {
  title: "Inline/InChat/SceneDivider",
  component: SceneDivider,
  args: { messageId: 7, divider: { time: "Day 3, evening", scene: true } },
};

export default meta;

type Story = StoryObj<typeof SceneDivider>;

export const TimeAndScene: Story = {
  play: async ({ canvasElement }) => {
    const divider = canvasElement.querySelector<HTMLElement>('[data-so="in-chat-divider"]');
    await expect(divider?.textContent).toBe("Day 3, evening · A new scene");
    await expect(divider?.getAttribute("role")).toBe("separator");
  },
};

export const SceneOnly: Story = {
  args: { divider: { time: null, scene: true } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="in-chat-divider"]')?.textContent).toBe("A new scene");
  },
};

export const TimeOnly: Story = { args: { divider: { time: "12th of Frostfall, night", scene: false } } };

const divider = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="in-chat-divider"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, divider);
export const Wide: Story = fitsAt(VIEWPORTS.wide, divider);
