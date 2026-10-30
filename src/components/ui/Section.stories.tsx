import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { Section } from "./Section";
import { Button } from "./Button";

const meta = {
  title: "Kit/Section",
  component: Section,
  args: { title: "Memory", description: "How the story remembers.", children: <p className="m-0">Body text.</p> },
} satisfies Meta<typeof Section>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  args: { actions: <Button size="sm">Show me</Button> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("heading", { name: "Memory" })).toBeInTheDocument();
    await expect(canvasElement.querySelector("details")).toBeNull();
  },
};

export const Collapsible: Story = {
  args: { collapsible: true, title: "Advanced", id: "kit-advanced" },
  play: async ({ canvasElement }) => {
    const details = canvasElement.querySelector<HTMLDetailsElement>("#kit-advanced");
    await expect(details?.open).toBe(false);
    await userEvent.click(within(canvasElement).getByText("Advanced"));
    await expect(details?.open).toBe(true);
  },
};
