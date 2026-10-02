import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import { GUIDE_TOPICS } from "@copilot/guideTopics";
import GuideDisclosure from "./GuideDisclosure";
import { STUDIO_TAB_GUIDE } from "../guideTabs";

const meta: Meta<typeof GuideDisclosure> = {
  title: "Studio/GuideDisclosure",
  component: GuideDisclosure,
  args: { topics: STUDIO_TAB_GUIDE.qualities ?? [] },
};

export default meta;

type Story = StoryObj<typeof GuideDisclosure>;

export const ClosedUntilAsked: Story = {
  play: async ({ canvasElement }) => {
    const disclosure = canvasElement.querySelector<HTMLDetailsElement>("#so-studio-guide");
    await expect(disclosure?.open).toBe(false);
    await expect(within(canvasElement).getByText("How to write this")).toBeVisible();
  },
};

export const ShowsTheCompactTopic: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("How to write this"));
    await expect(canvasElement.querySelectorAll('[data-so="guide-topic"]')).toHaveLength(STUDIO_TAB_GUIDE.qualities?.length ?? 0);
    await userEvent.click(canvas.getByText(GUIDE_TOPICS.latching.title));
    await expect(canvas.getByText(GUIDE_TOPICS.latching.text)).toBeVisible();
  },
};

export const CheckpointTopics: Story = {
  args: { topics: STUDIO_TAB_GUIDE.checkpoints ?? [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("How to write this"));
    await userEvent.click(canvas.getByText(GUIDE_TOPICS["opening-scene"].title));
    await expect(canvas.getByText(GUIDE_TOPICS["opening-scene"].text)).toBeVisible();
  },
};
