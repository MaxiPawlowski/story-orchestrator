import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { VIEWPORTS, expectFits } from "../../../.storybook/fit";
import { AskBox, type AskBoxReply } from "./AskBox";

const PLAYER_ANSWER: AskBoxReply = {
  status: "answered",
  answer: "Open the drawer's Memory tab and use the pin beside the fact you want kept.",
  topics: [{ id: "feature/memory-tab", title: "Memory tab" }],
  showMe: { kind: "feature", target: "memory-tab" },
};

const AUTHOR_ANSWER: AskBoxReply = {
  status: "answered",
  answer: "Tick Constant on the entry: a constant entry is always in context and skips every key check.",
  topics: [{ id: "st/lorebook-activation", title: "Lorebook activation" }, { id: "author/world-info", title: "World Info" }],
  showMe: { kind: "studio", target: "world-info" },
};

const meta: Meta<typeof AskBox> = {
  title: "Settings/AskBox",
  component: AskBox,
  args: { persona: "player", onAsk: fn(async () => PLAYER_ANSWER), onShowMe: fn() },
};

export default meta;

type Story = StoryObj<typeof AskBox>;

export const PlayerAsks: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/only what you have already seen/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Ask" })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText("Your question"), "How do I pin a memory?");
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await expect(args.onAsk).toHaveBeenCalledWith("How do I pin a memory?");
    await expect(await canvas.findByText(/use the pin/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="ask-topic"][data-topic="feature/memory-tab"]')).not.toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Show me" }));
    await expect(args.onShowMe).toHaveBeenCalledWith({ kind: "feature", target: "memory-tab" });
  },
};

export const AuthorAsks: Story = {
  args: { persona: "author", onAsk: fn(async () => AUTHOR_ANSWER) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/can read the whole story/)).toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText("Your question"), "How do I make a lorebook entry always on?");
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await expect(await canvas.findByText(/Tick Constant/)).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-so="ask-topic"]')).toHaveLength(2);
  },
};

export const ShowMeOnlyWhereItCanGo: Story = {
  args: { persona: "author", onAsk: fn(async () => AUTHOR_ANSWER), canShow: (target) => target.kind !== "studio" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Your question"), "q");
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await expect(await canvas.findByText(/Tick Constant/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Show me" })).toBeNull();
  },
};

export const ARefusalOrFailureReadsPlainly: Story = {
  args: { onAsk: fn(async () => ({ error: "The chat changed while the answer was being written." })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Your question"), "What happens later?");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect(await canvas.findByText(/The chat changed/)).toBeInTheDocument();
  },
};

const fits = (viewport: (typeof VIEWPORTS)[keyof typeof VIEWPORTS]): Story => ({
  parameters: { testViewport: viewport },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Your question"), "How do I pin a memory?");
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await canvas.findByText(/use the pin/);
    await expectFits(canvasElement, canvasElement.querySelector('[data-so="ask"]'));
  },
});

export const Phone = fits(VIEWPORTS.phone);

export const Tablet = fits(VIEWPORTS.tablet);

export const Wide = fits(VIEWPORTS.wide);
