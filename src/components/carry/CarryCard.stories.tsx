import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { CarryCard } from "./CarryCard";
import { carryState, carryView } from "./fixtures";

const meta: Meta<typeof CarryCard> = {
  title: "Carry/CarryCard",
  component: CarryCard,
  render: (args) => <div style={{ maxWidth: 360 }}><CarryCard {...args} /></div>,
  args: { view: carryView(), onDismiss: fn() },
};

export default meta;

type Story = StoryObj<typeof CarryCard>;

export const HeritageAndPreviously: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("From an earlier story")).toBeInTheDocument();
    await expect(canvas.getByText("The Lantern Coast — ended with “The Last Lantern”")).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-so="carry-heritage-lines"] li')).toHaveLength(2);
    await expect(canvas.queryByText("The Lamplighters: Trusted")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};

export const PreviouslyEnded: Story = {
  args: { view: carryView({ active: false }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-carry-previously")).toBeNull();
    await expect(canvasElement.querySelector("#so-carry-heritage")).not.toBeNull();
  },
};

export const NoHeritageLines: Story = {
  args: { view: carryView({ state: carryState({ values: [] }), active: false }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="carry-heritage-lines"]')).toBeNull();
  },
};

export const Phone: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-carry-dismiss")).not.toBeNull();
  },
};
