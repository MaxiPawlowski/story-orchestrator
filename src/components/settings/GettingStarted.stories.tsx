import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { gettingStartedSteps } from "@runtime/repair";
import { GettingStarted } from "./GettingStarted";

const meta: Meta<typeof GettingStarted> = {
  title: "Settings/GettingStarted",
  component: GettingStarted,
  args: { steps: gettingStartedSteps({ memoryModel: false, judgeReady: false, imagesReady: false }), dismissed: false, onReveal: fn(), onHide: fn() },
};

export default meta;

type Story = StoryObj<typeof GettingStarted>;

export const FreshInstall: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-so="getting-started-step"]')).toHaveLength(3);
    await expect(canvasElement.querySelector("#so-getting-started-hide")).toBeNull();
    await userEvent.click(canvas.getAllByRole("button", { name: "Show me" })[0]);
    await expect(args.onReveal).toHaveBeenCalledWith("so-extraction-profile");
  },
};

export const MemoryModelSet: Story = {
  args: { steps: gettingStartedSteps({ memoryModel: true, judgeReady: false, imagesReady: false }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-step="memory-model"]')?.getAttribute("data-done")).toBe("true");
    await userEvent.click(canvas.getByRole("button", { name: "Hide this list" }));
    await expect(args.onHide).toHaveBeenCalled();
  },
};

export const FoldsAwayWhenHidden: Story = {
  args: { steps: gettingStartedSteps({ memoryModel: true, judgeReady: false, imagesReady: false }), dismissed: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-getting-started")).toBeNull();
  },
};

export const Phone: Story = { parameters: { testViewport: { width: 390, height: 844 } } };
