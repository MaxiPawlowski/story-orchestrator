import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { BusyButton } from "./BusyButton";

const meta = { title: "Feedback/Busy button", component: BusyButton } satisfies Meta<typeof BusyButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Working: Story = {
  args: { children: "Restart story", work: () => new Promise((resolve) => setTimeout(resolve, 1500)) },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button");
    await userEvent.click(button);
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};
