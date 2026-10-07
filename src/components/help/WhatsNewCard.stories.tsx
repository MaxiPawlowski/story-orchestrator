import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { whatsNew } from "@features/registry";
import { WhatsNewCard } from "./WhatsNewCard";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof WhatsNewCard> = {
  title: "Settings/WhatsNewCard",
  component: WhatsNewCard,
  args: {
    features: whatsNew({ lastSeen: "2.5.0", configured: true, authorView: false }),
    homePage: "https://github.com/MaxiPawlowski/story-orchestrator",
    onShowMe: fn(),
    onDismiss: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof WhatsNewCard>;

export const SinceLastSeen: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const rows = [...canvasElement.querySelectorAll('[data-so="whats-new-feature"]')].map((row) => row.getAttribute("data-feature"));
    await expect(rows).toContain("help");
    await expect(rows).not.toContain("stories");
    await userEvent.click(canvas.getByRole("button", { name: "Got it" }));
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};

export const NothingNew: Story = {
  args: { features: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-whats-new")).toBeNull();
  },
};

const gotIt = (canvasElement: HTMLElement) => within(canvasElement).getByRole("button", { name: "Got it" });

export const Phone: Story = fitsAt(VIEWPORTS.phone, gotIt);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, gotIt);
export const Wide: Story = fitsAt(VIEWPORTS.wide, gotIt);
