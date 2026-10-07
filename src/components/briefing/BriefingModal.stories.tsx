import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { BriefingView } from "@engine/index";
import { BRIEFING_COPY } from "@features/helpCopy";
import { PLAYER_SETUP_COPY } from "@features/playerSetupCopy";
import { BriefingModal } from "./BriefingModal";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

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

export const WithIdentity: Story = {
  args: {
    blocks: [BLOCK],
    identity: {
      rechoose: false, onChoose: fn(async () => ({ ok: true })),
      view: {
        storyId: "road", pending: true, needsPane: true, player: { role: "a hired courier", summary: "You carry a sealed letter." }, fixedName: null,
        current: { avatarId: "max.png", name: "Max" }, personas: [{ avatarId: "max.png", name: "Max" }], canCreate: false,
        record: { pending: true }, lockedName: null, switched: false, injected: true, beforeFirstMessage: true, castClash: null, descriptionEmpty: false, injectOff: false,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(PLAYER_SETUP_COPY.heading);
    const order = [...canvasElement.querySelectorAll('[data-so="briefing-before-you-start"], [data-so="player-setup"], [data-so="briefing-story"]')].map((node) => node.getAttribute("data-so"));
    await expect(order).toEqual(["briefing-before-you-start", "player-setup", "briefing-story"]);
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

const everything = { args: { blocks: [BLOCK], onboarding: true, optOut: true } };
const begin = async (canvasElement: HTMLElement) => {
  const dialog = await within(canvasElement).findByRole("dialog", { name: "The Road to Varn" });
  return within(dialog).getByRole("button", { name: "Begin" });
};

export const Phone: Story = { ...everything, ...fitsAt(VIEWPORTS.phone, begin) };
export const Tablet: Story = { ...everything, ...fitsAt(VIEWPORTS.tablet, begin) };
export const Desktop: Story = { ...everything, ...fitsAt(VIEWPORTS.wide, begin) };

const HOST_MENU_BUTTON = ".menu_button { width: min-content; display: flex; padding: 3px 5px; }";

export const CloseButtonOnOneLine: Story = {
  args: { briefing: null, blocks: [BLOCK] },
  decorators: [(Inner) => <><style>{HOST_MENU_BUTTON}</style><Inner /></>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: BRIEFING_COPY.close });
    const box = button.getBoundingClientRect();
    const line = parseFloat(getComputedStyle(button).lineHeight) || parseFloat(getComputedStyle(button).fontSize) * 1.5;
    await expect(box.height).toBeLessThan(line * 2);
    await expect(box.width).toBeGreaterThan(box.height);
  },
};
