import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { GateMeter } from "./GateMeter";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof GateMeter> = {
  title: "Inline/InChat/GateMeter",
  component: GateMeter,
  args: {
    messageId: 8,
    meter: {
      moved: null,
      rows: [
        { toName: "The Yard", met: 1, total: 2, ready: false, open: ["has key = true, now unset"] },
        { toName: "The Road", met: 0, total: 1, ready: false, open: ["alarm raised = true, now false"] },
      ],
    },
  },
};

export default meta;

type Story = StoryObj<typeof GateMeter>;

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const rows = [...canvasElement.querySelectorAll<HTMLElement>('[data-so="gate-meter-row"]')];
    await expect(rows).toHaveLength(2);
    await expect(rows[0].textContent).toContain("1 of 2");
    await expect(rows[0].textContent).toContain("has key = true, now unset");
  },
};

export const Moved: Story = {
  args: { meter: { moved: "The Yard", rows: [{ toName: "The Tower", met: 2, total: 2, ready: true, open: [] }] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="gate-meter-moved"]')?.textContent).toBe("Moved to The Yard");
    await expect(canvasElement.querySelector('[data-so="gate-meter-row"]')?.hasAttribute("data-ready")).toBe(true);
  },
};

const meter = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="gate-meter"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, meter);
export const Wide: Story = fitsAt(VIEWPORTS.wide, meter);
