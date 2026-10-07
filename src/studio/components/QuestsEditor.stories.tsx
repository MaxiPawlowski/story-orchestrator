import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import QuestsEditor from "./QuestsEditor";
import { useDraftStore } from "../draft";
import { gameStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof QuestsEditor> = {
  title: "Studio/QuestsEditor",
  component: QuestsEditor,
};

export default meta;

type Story = StoryObj<typeof QuestsEditor>;

const seeded = { beforeEach: () => { seedDraft(gameStory()); } };

export const EditsAQuest: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = canvas.getByLabelText("debt title");
    await userEvent.clear(title);
    await userEvent.type(title, "A debt repaid");
    await expect(useDraftStore.getState().draft.quests?.[0].title).toBe("A debt repaid");
    await userEvent.click(canvas.getByRole("button", { name: "+ Step" }));
    await expect(useDraftStore.getState().draft.quests?.[0].steps).toHaveLength(2);
  },
};

export const AddsAndRemoves: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("New quest id"), "lantern");
    await userEvent.click(canvas.getByRole("button", { name: "+ Quest" }));
    await expect(useDraftStore.getState().draft.quests?.map((quest) => quest.id)).toEqual(["debt", "lantern"]);
    await userEvent.click(canvas.getByRole("button", { name: "Remove quest debt" }));
    await expect(useDraftStore.getState().draft.quests?.map((quest) => quest.id)).toEqual(["lantern"]);
  },
};

export const RewardJsonRefusesBadInput: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByLabelText("debt reward"), "{{not json");
    await userEvent.tab();
    await expect(canvasElement.querySelector('[data-so="json-problem"]')).not.toBeNull();
    await expect(useDraftStore.getState().draft.quests?.[0].reward).toBeUndefined();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="quests-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
