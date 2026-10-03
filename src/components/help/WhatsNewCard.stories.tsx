import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { whatsNew } from "@features/registry";
import { WhatsNewCard } from "./WhatsNewCard";

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

export const Phone: Story = { parameters: { testViewport: { width: 390, height: 844 } } };
