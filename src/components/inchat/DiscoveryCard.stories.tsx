import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent } from "@storybook/test";
import { DiscoveryCard } from "./DiscoveryCard";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof DiscoveryCard> = {
  title: "Inline/InChat/DiscoveryCard",
  component: DiscoveryCard,
  args: { item: { key: "people:keeper:3", page: "people", name: "The keeper", first: true, facts: ["Keeps the gate keys."] }, onOpen: fn() },
};

export default meta;

type Story = StoryObj<typeof DiscoveryCard>;

export const NewPerson: Story = {
  play: async ({ canvasElement, args }) => {
    const card = canvasElement.querySelector<HTMLElement>('[data-so="discovery-card"]');
    await expect(card?.textContent).toContain("New in your journal");
    await expect(card?.textContent).toContain("Keeps the gate keys.");
    await userEvent.click(canvasElement.querySelector('[data-so="discovery-open"]') as HTMLElement);
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
  },
};

export const MoreAboutAPlace: Story = {
  args: { item: { key: "places:mill:6", page: "places", name: "The old mill", first: false, facts: ["The wheel still turns at night.", "Someone oils the gears."] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="discovery-card"]')?.getAttribute("data-page")).toBe("places");
  },
};

const card = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="discovery-card"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, card);
export const Wide: Story = fitsAt(VIEWPORTS.wide, card);
