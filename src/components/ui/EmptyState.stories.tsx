import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { EmptyState } from "./EmptyState";
import { Button } from "./Button";

const meta = { title: "Kit/EmptyState", component: EmptyState, args: { icon: "fa-inbox", title: "No proposals yet" } } satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithAction: Story = {
  args: { children: "The curator proposes lore changes after a few replies.", action: <Button variant="primary">Ask for proposals</Button> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No proposals yet")).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-so=empty-state]")).not.toBeNull();
  },
};

export const TitleOnly: Story = {};
