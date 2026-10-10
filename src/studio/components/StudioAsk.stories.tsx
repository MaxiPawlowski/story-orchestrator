import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { runAsk } from "@copilot/agent/ask";
import { emptyLookup } from "@copilot/agent/types";
import type { StoryV2 } from "@engine/index";
import { VIEWPORTS, expectFits } from "../../../.storybook/fit";
import { sampleStory, seedDraft } from "../stories/fixtures";
import StudioAsk from "./StudioAsk";

const scripted = (replies: string[]) => async (question: string, draft: StoryV2) => {
  const queue = [...replies];
  const result = await runAsk({ question, context: { persona: "author", draft, lookup: emptyLookup(), liveState: null }, model: async () => queue.shift() ?? "" });
  return { status: result.status, answer: result.answer, topics: result.topics.map((topic) => ({ id: topic.id, title: topic.title })), showMe: result.showMe };
};

const RECOMMEND = [
  JSON.stringify({ tool: "readRecommendations", args: {} }),
  JSON.stringify({ answer: "Nothing blocks the draft. Give the guide a role so speaker direction can pick by it.", topics: ["author/roster"] }),
];

const meta: Meta<typeof StudioAsk> = {
  title: "Studio/StudioAsk",
  component: StudioAsk,
  args: { ask: scripted(RECOMMEND), onShowTopic: fn() },
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof StudioAsk>;

export const RecommendsFromTheDraft: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Your question"), "What should I fix in this draft?");
    await userEvent.click(canvas.getByRole("button", { name: "Ask" }));
    await expect(await canvas.findByText(/Give the guide a role/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Show me" }));
    await expect(args.onShowTopic).toHaveBeenCalledWith({ kind: "studio", target: "roster" });
  },
};

export const UnavailableWithoutAModel: Story = {
  args: { ask: undefined },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="studio-ask-unavailable"]')).not.toBeNull();
    await expect(within(canvasElement).queryByLabelText("Your question")).toBeNull();
  },
};

const fits = (viewport: (typeof VIEWPORTS)[keyof typeof VIEWPORTS]): Story => ({
  parameters: { testViewport: viewport },
  play: async ({ canvasElement }) => {
    await expectFits(canvasElement, canvasElement.querySelector("#so-studio-ask"));
  },
});

export const Phone = fits(VIEWPORTS.phone);

export const Tablet = fits(VIEWPORTS.tablet);

export const Wide = fits(VIEWPORTS.wide);
