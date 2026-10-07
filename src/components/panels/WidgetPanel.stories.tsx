import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { WidgetPanel } from "./WidgetPanel";
import { boardWidget, clockWidget } from "../widgets/gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof WidgetPanel> = {
  title: "Panels/WidgetPanel",
  component: WidgetPanel,
  args: { widget: clockWidget },
};

export default meta;

type Story = StoryObj<typeof WidgetPanel>;

export const ClockPanel: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-widget-alarm-clock")).not.toBeNull();
    await expect(within(canvasElement).getByRole("img", { name: "Alarm: 4 of 6" })).toBeVisible();
  },
};

export const BoardPanel: Story = { args: { widget: boardWidget } };

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="widget-panel"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
