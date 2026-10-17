import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import CommitmentsEditor from "./CommitmentsEditor";
import { useDraftStore } from "../draft";
import { commitmentStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof CommitmentsEditor> = {
  title: "Studio/CommitmentsEditor",
  component: CommitmentsEditor,
};

export default meta;

type Story = StoryObj<typeof CommitmentsEditor>;

const seeded = { beforeEach: () => { seedDraft(commitmentStory()); } };

const promises = () => useDraftStore.getState().draft.roster[0].commitments ?? [];

export const EditsPromises: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const member = useDraftStore.getState().draft.roster[0];
    await expect(canvas.getByText("Promises to the player")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: `+ Promise from ${member.name ?? member.id}` }));
    await expect(promises()).toHaveLength(2);
    await userEvent.click(canvas.getByLabelText(`${member.id} promise gate made before the story`));
    await expect(promises()[0].made_when).toBe("start");
    await userEvent.click(canvas.getByLabelText(`${member.id} promise gate heard by the player`));
    await expect(promises()[0].heard).toBe(false);
    await userEvent.selectOptions(canvas.getByLabelText(`${member.id} promise gate due`), "boundaries");
    await expect(promises()[0].due).toEqual({ boundaries: 12 });
    await userEvent.click(canvas.getByRole("button", { name: `Remove ${member.id} promise promise` }));
    await expect(promises().map((item) => item.id)).toEqual(["gate"]);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="commitments-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
