import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { GpuBrokerLineView } from "../../image/GpuBrokerLine";

const meta: Meta<typeof GpuBrokerLineView> = {
  title: "Settings/GpuBrokerLine",
  component: GpuBrokerLineView,
};

export default meta;

type Story = StoryObj<typeof GpuBrokerLineView>;

export const RenderingAPicture: Story = {
  args: { status: { adapter: "supervise", guarding: true, state: "image" } },
  play: async ({ canvasElement }) => {
    const line = within(canvasElement).getByRole("status");
    await expect(line).toHaveTextContent("Rendering a picture");
    await expect(line).toHaveAttribute("data-tone", "busy");
  },
};

export const WaitingSaysWhy: Story = {
  args: { status: { adapter: "supervise", guarding: true, state: "waiting", lastError: "Image admission refused: Insufficient GPU headroom." } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Last refusal: Image admission refused");
  },
};

export const TextServerStopped: Story = {
  args: { status: { adapter: "supervise", guarding: true, state: "degraded" } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveAttribute("data-tone", "warn");
  },
};

export const NoPluginShowsNothing: Story = {
  args: { status: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("status")).toBeNull();
  },
};
