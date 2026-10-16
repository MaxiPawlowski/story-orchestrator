import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import RumorsEditor from "./RumorsEditor";
import { useDraftStore } from "../draft";
import { rumorStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof RumorsEditor> = {
  title: "Studio/RumorsEditor",
  component: RumorsEditor,
};

export default meta;

type Story = StoryObj<typeof RumorsEditor>;

const seeded = { beforeEach: () => { seedDraft(rumorStory()); } };

export const VersionsAndChannels: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("flood version 1 truth"), "false");
    await expect(useDraftStore.getState().draft.rumors?.[0].versions?.[0].truth).toBe("false");
    await userEvent.click(canvas.getByRole("button", { name: "+ Version" }));
    await expect(useDraftStore.getState().draft.rumors?.[0].versions).toHaveLength(2);
    const roster = useDraftStore.getState().draft.roster;
    const [first, second] = [roster[0], roster[roster.length - 1]];
    await userEvent.click(canvas.getByLabelText(`${first.id} talks to ${second.id}`));
    await expect(useDraftStore.getState().draft.roster[0].gossip).toBeUndefined();
    await userEvent.click(canvas.getByLabelText(`${second.id} talks to ${first.id}`));
    await expect(useDraftStore.getState().draft.roster.at(-1)?.gossip).toEqual({ talks_to: [first.id] });
    await userEvent.click(canvas.getByRole("button", { name: "+ Rumor" }));
    await expect(useDraftStore.getState().draft.rumors).toHaveLength(2);
    await userEvent.click(canvas.getByLabelText("Remove rumor flood"));
    await expect(useDraftStore.getState().draft.rumors?.map((rumor) => rumor.id)).toEqual(["rumor"]);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="rumors-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
