import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import MilestonesEditor from "./MilestonesEditor";
import { useDraftStore } from "../draft";
import { gameStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof MilestonesEditor> = {
  title: "Studio/MilestonesEditor",
  component: MilestonesEditor,
};

export default meta;

type Story = StoryObj<typeof MilestonesEditor>;

const seeded = { beforeEach: () => { seedDraft(gameStory()); } };

export const MarksSecret: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("crossing secret"));
    await expect(useDraftStore.getState().draft.milestones?.[0].secret).toBe(true);
    await userEvent.click(canvas.getByRole("button", { name: "+ Milestone" }));
    await expect(useDraftStore.getState().draft.milestones).toHaveLength(2);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="milestones-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
