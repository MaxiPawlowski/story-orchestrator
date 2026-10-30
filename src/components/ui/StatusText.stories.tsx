import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { StatusText } from "./StatusText";

const meta = { title: "Kit/StatusText", component: StatusText, args: { children: "One book is missing." } } satisfies Meta<typeof StatusText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div className="so-section">
      <StatusText tone="warn">One book is missing.</StatusText>
      <StatusText tone="error" role="alert">The save did not land.</StatusText>
      <StatusText tone="ok">Saved to the library.</StatusText>
      <StatusText tone="info" as="span">Images are paused.</StatusText>
      <StatusText tone="neutral">Nothing to report.</StatusText>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const lines = [...canvasElement.querySelectorAll(".so-status-text")];
    await expect(lines).toHaveLength(5);
    await expect(lines.filter((line) => line.getAttribute("data-tone") !== "neutral").every((line) => line.querySelector(":scope > i"))).toBe(true);
  },
};
