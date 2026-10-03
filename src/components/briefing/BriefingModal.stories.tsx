import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { BriefingView } from "@engine/index";
import { BRIEFING_COPY } from "@features/helpCopy";
import { BriefingModal } from "./BriefingModal";

const briefing: BriefingView = {
  title: "The Road to Varn",
  image: null,
  tone: "Dark fantasy, mature themes, violence.",
  startLabel: "Begin",
  source: "authored",
  chapterId: null,
  sections: [
    { heading: "The world", text: "A border town under a long winter.\n\nThe pass closes in three days." },
    { heading: "Who you are", text: "A courier with a debt and a sealed letter." },
    { heading: "Who is with you", text: "Mara, a guide who knows the pass." },
    { heading: "How to play", text: "Write what you do and say; the world answers." },
  ],
};

const chapter: BriefingView = {
  title: "The Pass", image: null, tone: null, startLabel: "Go on", source: "authored", chapterId: "pass",
  sections: [{ heading: "Where you are", text: "Snow to the knees, and the gate behind you." }],
};

const BLOCK = "This story needs a group chat with its characters in it.";

const meta: Meta<typeof BriefingModal> = {
  title: "Briefing/BriefingModal",
  component: BriefingModal,
  args: { briefing, onClose: fn() },
};

export default meta;

type Story = StoryObj<typeof BriefingModal>;

export const BriefingOnly: Story = {
  args: { optOut: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const dialog = await canvas.findByRole("dialog", { name: "The Road to Varn" });
    await expect(dialog).toHaveAttribute("open");
    await expect(canvasElement.querySelectorAll('[data-so="briefing-section"]')).toHaveLength(4);
    await expect(canvasElement.querySelectorAll(".so-briefing-paragraph").length).toBeGreaterThan(4);
    await expect(canvasElement.querySelector('[data-so="briefing-before-you-start"]')).toBeNull();
    await userEvent.click(canvas.getByLabelText(BRIEFING_COPY.optOut));
    await userEvent.click(canvas.getByRole("button", { name: "Begin" }));
    await expect(args.onClose).toHaveBeenCalledWith({ dontShow: true });
    await expect(dialog).not.toHaveAttribute("open");
  },
};

export const BeforeYouStartOnly: Story = {
  args: { briefing: null, blocks: [BLOCK] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("dialog", { name: BRIEFING_COPY.beforeYouStart });
    await expect(canvas.getByRole("alert")).toHaveTextContent(BLOCK);
    await expect(canvasElement.querySelector("#so-briefing-optout")).toBeNull();
  },
};

export const Both: Story = {
  args: { blocks: [BLOCK], optOut: true },
  play: async ({ canvasElement }) => {
    const order = [...canvasElement.querySelectorAll('[data-so="briefing-before-you-start"], [data-so="briefing-story"]')].map((node) => node.getAttribute("data-so"));
    await expect(order).toEqual(["briefing-before-you-start", "briefing-story"]);
  },
};

export const FirstRun: Story = {
  args: { onboarding: true, optOut: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText(BRIEFING_COPY.onboarding));
    await expect(canvasElement.querySelector('[data-so="briefing-onboarding"]')).toHaveAttribute("open");
    await expect(canvas.getByText(/opens the story drawer/)).toBeVisible();
  },
};

export const ChapterBriefing: Story = {
  args: { briefing: null, chapter },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("dialog", { name: "The Pass" });
    await expect(canvas.getByRole("button", { name: "Go on" })).toBeInTheDocument();
  },
};

export const EscapeCloses: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("dialog", { name: "The Road to Varn" });
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledWith({ dontShow: false });
  },
};

export const Phone: Story = { args: { blocks: [BLOCK], onboarding: true, optOut: true }, parameters: { testViewport: { width: 390, height: 844 } } };
export const Tablet: Story = { args: { blocks: [BLOCK], onboarding: true, optOut: true }, parameters: { testViewport: { width: 768, height: 1024 } } };
export const Desktop: Story = { args: { blocks: [BLOCK], onboarding: true, optOut: true }, parameters: { testViewport: { width: 1440, height: 900 } } };
