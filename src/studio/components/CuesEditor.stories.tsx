import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import CuesEditor from "./CuesEditor";
import { useDraftStore } from "../draft";
import { cueStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof CuesEditor> = {
  title: "Studio/CuesEditor",
  component: CuesEditor,
};

export default meta;

type Story = StoryObj<typeof CuesEditor>;

const seeded = { beforeEach: () => { seedDraft(cueStory()); } };

const member = () => useDraftStore.getState().draft.roster[0];

export const EditsCuesAndTopics: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const id = member().id;
    await expect(canvas.getByText("Cues and topics")).toBeVisible();
    await userEvent.selectOptions(canvas.getByLabelText(`${id} cue alarm lane`), "must");
    await expect(member().cues?.[0]).toEqual(expect.objectContaining({ lane: "must", landed_when: { all: [] } }));
    await userEvent.selectOptions(canvas.getByLabelText(`${id} cue alarm lane`), "may");
    await expect(member().cues?.[0].lane).toBeUndefined();
    await userEvent.clear(canvas.getByLabelText(`${id} cue alarm cue`));
    await userEvent.type(canvas.getByLabelText(`${id} cue alarm cue`), "you feel the bell");
    await expect(canvasElement.querySelector('[data-so="cue-warning"]')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "+ Deeper tier" }));
    await expect(member().topics?.[0].tiers).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: `+ Cue for ${member().name ?? id}` }));
    await expect(member().cues).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: `Remove ${id} topic gate` }));
    await expect(member().topics).toBeUndefined();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="cues-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
