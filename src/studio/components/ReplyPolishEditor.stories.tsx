import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import ReplyPolishEditor from "./ReplyPolishEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof ReplyPolishEditor> = {
  title: "Studio/ReplyPolishEditor",
  component: ReplyPolishEditor,
};

export default meta;

type Story = StoryObj<typeof ReplyPolishEditor>;

const withNarrator = () => {
  const base = sampleStory();
  return { ...base, roster: [...base.roster, { id: "narrator", name: "Narrator", role: "narrator", view: "omniscient" as const }] };
};

const polish = () => useDraftStore.getState().draft.polish;

export const SetsModeAndNarration: Story = {
  beforeEach: () => { seedDraft(withNarrator()); },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Reply polish")).toBeVisible();
    await userEvent.selectOptions(canvas.getByLabelText("Reply polish mode"), "off");
    await expect(polish()?.mode).toBe("off");
    await userEvent.type(canvas.getByLabelText("Narration voice notes"), "Present tense.");
    await expect(polish()?.narration?.notes).toBe("Present tense.");
    await userEvent.type(canvas.getByLabelText("Narration Words the narration avoids"), "suddenly{Enter}");
    await expect(polish()?.narration?.avoid).toEqual(["suddenly"]);
    await userEvent.selectOptions(canvas.getByLabelText("Reply polish mode"), "");
    await expect(polish()?.mode).toBeUndefined();
    await expect(polish()?.narration?.avoid).toEqual(["suddenly"]);
  },
};

export const NoNarratorNoNarrationVoice: Story = {
  beforeEach: () => { seedDraft(sampleStory()); },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="reply-polish-narration"]')).toBeNull();
    await expect(within(canvasElement).getByText(/needs a narrator/)).toBeVisible();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="reply-polish-editor"]');

export const Phone: Story = { beforeEach: () => { seedDraft(withNarrator()); }, ...fitsAt(VIEWPORTS.phone, primary) };
export const Wide: Story = { beforeEach: () => { seedDraft(withNarrator()); }, ...fitsAt(VIEWPORTS.wide, primary) };
