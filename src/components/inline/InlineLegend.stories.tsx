import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { InlineLegend } from "./InlineLegend";

const meta: Meta<typeof InlineLegend> = {
  title: "Inline/InlineLegend",
  component: InlineLegend,
  args: { level: 1 },
};

export default meta;

type Story = StoryObj<typeof InlineLegend>;

export const PlayerLevels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="inline-legend"]')).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "What do these icons mean?" }));
    const legend = canvasElement.querySelector('[data-so="inline-legend"]') as HTMLElement;
    await expect(within(legend).getByText("Progress")).toBeInTheDocument();
    await expect(within(legend).getByText("Behind the scenes")).toBeInTheDocument();
    await expect(within(legend).queryByText("Raw")).toBeNull();
  },
};

export const AuthorLevels: Story = {
  args: { level: 3 },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "What do these icons mean?" }));
    await expect(within(canvasElement.querySelector('[data-so="inline-legend"]') as HTMLElement).getByText("Raw")).toBeInTheDocument();
  },
};

export const Phone: Story = { parameters: { testViewport: { width: 390, height: 844 } } };
