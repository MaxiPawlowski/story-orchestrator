import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import { authorGuideDoc } from "@features/guideLinks";
import { GUIDE_COPY } from "@features/helpCopy";
import { GUIDE_TOPICS } from "@copilot/guideTopics";
import GuideDisclosure from "./GuideDisclosure";
import { STUDIO_TAB_GUIDE } from "../guideTabs";

const meta: Meta<typeof GuideDisclosure> = {
  title: "Studio/GuideDisclosure",
  component: GuideDisclosure,
  args: { topics: STUDIO_TAB_GUIDE.qualities ?? [], onOpenGuide: fn() },
};

export default meta;

type Story = StoryObj<typeof GuideDisclosure>;

export const ClosedUntilAsked: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "How to write this" });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(canvasElement.querySelectorAll('[data-so="guide-topic"]')).toHaveLength(0);
  },
};

export const ListsThePageTopics: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "How to write this" }));
    await expect(canvasElement.querySelectorAll('[data-so="guide-topic"]')).toHaveLength(STUDIO_TAB_GUIDE.qualities?.length ?? 0);
    await expect(canvas.getByText(GUIDE_TOPICS.latching.text)).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(canvasElement.querySelectorAll('[data-so="guide-topic"]')).toHaveLength(0);
  },
};

export const OpensTheTopicInTheGuide: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "How to write this" }));
    await userEvent.click(canvas.getByRole("button", { name: `${GUIDE_COPY.openInGuide}: ${GUIDE_TOPICS.latching.title}` }));
    await expect(args.onOpenGuide).toHaveBeenCalledWith(authorGuideDoc("latching"));
    await expect(canvasElement.querySelectorAll('[data-so="guide-topic"]')).toHaveLength(0);
  },
};

export const CheckpointTopics: Story = {
  args: { topics: STUDIO_TAB_GUIDE.checkpoints ?? [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "How to write this" }));
    await expect(canvas.getByText(GUIDE_TOPICS["opening-scene"].title)).toBeVisible();
  },
};
