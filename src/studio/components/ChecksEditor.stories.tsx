import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { ChecksEditor, QualityDisplayEditor } from "./ChecksEditor";
import { useDraftStore } from "../draft";
import { gameStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof ChecksEditor> = {
  title: "Studio/ChecksEditor",
  component: ChecksEditor,
};

export default meta;

type Story = StoryObj<typeof ChecksEditor>;

const seeded = { beforeEach: () => { seedDraft(gameStory()); } };

export const SetsACheckpointCheck: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByLabelText("Checks at Infiltrate");
    await userEvent.type(field, '[[{{"id": "climb", "quality": "alarm", "roll": {{"sides": 20, "target": 12}, "narrate": "public"}]');
    await userEvent.tab();
    await expect(useDraftStore.getState().draft.checkpoints[1].checks?.[0].id).toBe("climb");
  },
};

export const PublicQualities: Story = {
  ...seeded,
  render: () => <QualityDisplayEditor />,
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByLabelText("Display trust"), '{{"public": true, "label": "Trust", "as": "meter"}');
    await userEvent.tab();
    await expect(useDraftStore.getState().draft.qualities[0].display?.label).toBe("Trust");
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="checks-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
