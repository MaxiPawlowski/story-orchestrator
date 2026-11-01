import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent } from "@storybook/test";
import { ChatEndChips } from "./ChatEndChips";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof ChatEndChips> = {
  title: "Inline/InChat/ChatEndChips",
  component: ChatEndChips,
  args: {
    chips: { messageId: 9, yours: true, ideas: true, offers: [{ key: "ask", text: "I ask the keeper about the gate." }, { key: "wait", text: "I wait by the fire." }] },
    fill: fn(() => ({ ok: true as const })),
    openIdeas: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof ChatEndChips>;

export const YourMove: Story = {
  play: async ({ canvasElement, args }) => {
    await expect(canvasElement.querySelector('[data-so="chat-end-your-move"]')?.textContent).toBe("Your move");
    await userEvent.click(canvasElement.querySelector('[data-so="chat-end-offer"]') as HTMLElement);
    await expect(args.fill).toHaveBeenCalledWith("I ask the keeper about the gate.");
    await expect(canvasElement.querySelector('[data-so="chat-end-outcome"]')?.getAttribute("data-tone")).toBe("ok");
    await userEvent.click(canvasElement.querySelector('[data-so="chat-end-ideas"]') as HTMLElement);
    await expect(args.openIdeas).toHaveBeenCalledTimes(1);
  },
};

export const RefusedWhileTyping: Story = {
  args: { fill: fn(() => ({ ok: false as const, reason: "You started typing, so the suggestion was not put in." })) },
  play: async ({ canvasElement }) => {
    await userEvent.click(canvasElement.querySelector('[data-so="chat-end-offer"]') as HTMLElement);
    await expect(canvasElement.querySelector('[data-so="chat-end-outcome"]')?.textContent).toContain("You started typing");
  },
};

export const IdeasOnly: Story = { args: { chips: { messageId: 9, yours: false, ideas: true, offers: [] } } };

const chips = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="chat-end-chips"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, chips);
export const Wide: Story = fitsAt(VIEWPORTS.wide, chips);
