import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import NormsEditor from "./NormsEditor";
import { useDraftStore } from "../draft";
import { cueStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof NormsEditor> = {
  title: "Studio/NormsEditor",
  component: NormsEditor,
};

export default meta;

type Story = StoryObj<typeof NormsEditor>;

const seeded = { beforeEach: () => { seedDraft(cueStory()); } };

const norms = () => useDraftStore.getState().draft.norms ?? [];

export const EditsNorms: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const witness = useDraftStore.getState().draft.roster[0].id;
    await expect(canvas.getByText("Social norms")).toBeVisible();
    await userEvent.click(canvas.getByLabelText(`norm bell noticed by ${witness}`));
    await expect(norms()[0].noticed_by).toEqual([]);
    await userEvent.click(canvas.getByRole("button", { name: "+ Norm" }));
    await expect(norms()).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Remove norm bell" }));
    await expect(norms().map((norm) => norm.id)).toEqual(["norm"]);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="norms-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
