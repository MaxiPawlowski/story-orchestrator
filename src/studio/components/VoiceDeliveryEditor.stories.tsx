import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import VoiceDeliveryEditor from "./VoiceDeliveryEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof VoiceDeliveryEditor> = {
  title: "Studio/VoiceDeliveryEditor",
  component: VoiceDeliveryEditor,
};

export default meta;

type Story = StoryObj<typeof VoiceDeliveryEditor>;

const moodStory = () => {
  const base = sampleStory();
  return {
    ...base,
    roster: base.roster.map((member, index) => (index === 0
      ? { ...member, mood: { values: ["calm", "angry"], baseline: "calm", lasts: { boundaries: 3 } }, polish: { notes: "Short sentences.", prefer: ["mind the rope"] } }
      : member)).concat([{ id: "warden", name: "The Warden" }]),
  };
};

const seeded = { beforeEach: () => { seedDraft(moodStory()); } };

const sheet = (index = 0) => useDraftStore.getState().draft.roster[index].polish;

export const EditsASheet: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = useDraftStore.getState().draft.roster[0].name ?? useDraftStore.getState().draft.roster[0].id;
    await expect(canvas.getByText("Voice and delivery")).toBeVisible();
    await expect(canvas.getByLabelText(`${name} voice notes`)).toHaveValue("Short sentences.");
    await userEvent.type(canvas.getByLabelText(`${name} Words they would not use`), "indeed{Enter}");
    await expect(sheet()?.avoid).toEqual(["indeed"]);
    await userEvent.selectOptions(canvas.getByLabelText(`${name} rhythm`), "clipped");
    await expect(sheet()?.rhythm).toBe("clipped");
    await userEvent.type(canvas.getByLabelText(`${name} delivery when angry`), "Bitten off.");
    await expect(sheet()?.by_mood).toEqual({ angry: "Bitten off." });
    await userEvent.click(canvas.getByRole("button", { name: `Remove ${name} Words that are theirs mind the rope` }));
    await expect(sheet()?.prefer).toBeUndefined();
    await userEvent.click(canvas.getByLabelText(`${name} voice sheet on`));
    await expect(sheet()?.enabled).toBe(false);
  },
};

export const MoodRowsOnlyWithAMood: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const members = canvasElement.querySelectorAll('[data-so="delivery-member"]');
    await expect(members.length).toBe(useDraftStore.getState().draft.roster.length);
    await expect(members[0].querySelector('[data-so="delivery-moods"]')).not.toBeNull();
    await expect(members[1].querySelector('[data-so="delivery-moods"]')).toBeNull();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="delivery-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
