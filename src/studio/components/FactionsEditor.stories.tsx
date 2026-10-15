import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import FactionsEditor from "./FactionsEditor";
import { useDraftStore } from "../draft";
import { factionStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof FactionsEditor> = {
  title: "Studio/FactionsEditor",
  component: FactionsEditor,
};

export default meta;

type Story = StoryObj<typeof FactionsEditor>;

const seeded = { beforeEach: () => { seedDraft(factionStory()); } };

export const MovesAndMembers: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("guild move 1 heard by"), "faction");
    await expect(useDraftStore.getState().draft.factions?.[0].moves[0].heard_by).toBe("faction");
    await userEvent.click(canvas.getByRole("button", { name: "+ Move" }));
    await expect(useDraftStore.getState().draft.factions?.[0].moves).toHaveLength(2);
    const member = useDraftStore.getState().draft.roster[0].id;
    await userEvent.click(canvas.getByLabelText(`${member} belongs to guild`));
    await expect(useDraftStore.getState().draft.roster[0].factions).toBeUndefined();
    await userEvent.click(canvas.getByRole("button", { name: "+ Faction" }));
    await expect(useDraftStore.getState().draft.factions).toHaveLength(2);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="factions-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
