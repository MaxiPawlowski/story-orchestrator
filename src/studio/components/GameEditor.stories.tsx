import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import GameEditor from "./GameEditor";
import { gameStory } from "./gameEditorFixtures";
import { sampleStory, seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof GameEditor> = {
  title: "Studio/GameEditor",
  component: GameEditor,
};

export default meta;

type Story = StoryObj<typeof GameEditor>;

const seeded = { beforeEach: () => { seedDraft(gameStory()); } };

export const AllSections: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    for (const section of ["quests-editor", "milestones-editor", "checks-editor", "quality-display-editor", "widgets-editor"]) {
      await expect(canvasElement.querySelector(`[data-so="${section}"]`)).not.toBeNull();
    }
  },
};

export const NoGameLayer: Story = {
  beforeEach: () => { seedDraft(sampleStory()); },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No side quests yet. The main line is the checkpoint graph.")).toBeVisible();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="game-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
