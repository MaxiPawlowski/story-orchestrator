import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { InlineLegendPanel } from "./InlineLegend";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof InlineLegendPanel> = {
  title: "Inline/InlineLegend",
  component: InlineLegendPanel,
  args: { level: 1, id: "so-inline-legend" },
  decorators: [(Story) => <div id="so-panels-root"><Story /></div>],
};

export default meta;

type Story = StoryObj<typeof InlineLegendPanel>;

export const PlayerLevels: Story = {
  play: async ({ canvasElement }) => {
    const legend = canvasElement.querySelector('[data-so="inline-legend"]') as HTMLElement;
    await expect(within(legend).getByText("Progress")).toBeInTheDocument();
    await expect(within(legend).getByText("Behind the scenes")).toBeInTheDocument();
    await expect(within(legend).queryByText("Raw")).toBeNull();
  },
};

export const AuthorLevels: Story = {
  args: { level: 3 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement.querySelector('[data-so="inline-legend"]') as HTMLElement).getByText("Raw")).toBeInTheDocument();
  },
};

const legend = async (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="inline-legend"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, legend);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, legend);
export const Wide: Story = fitsAt(VIEWPORTS.wide, legend);
