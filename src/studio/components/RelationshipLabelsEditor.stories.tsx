import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import RelationshipLabelsEditor from "./RelationshipLabelsEditor";
import { useDraftStore } from "../draft";
import { labelStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof RelationshipLabelsEditor> = {
  title: "Studio/RelationshipLabelsEditor",
  component: RelationshipLabelsEditor,
};

export default meta;

type Story = StoryObj<typeof RelationshipLabelsEditor>;

const seeded = { beforeEach: () => { seedDraft(labelStory()); } };

const relationship = () => useDraftStore.getState().draft.roster[0].relationships?.[0];

export const PublicAndSecretLabels: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const member = useDraftStore.getState().draft.roster[0].id;
    await userEvent.click(canvas.getByRole("button", { name: "+ Public label" }));
    await expect(relationship()?.public).toHaveLength(2);
    await userEvent.click(canvas.getByLabelText(`${member} toward player public label 2 follows the feeling`));
    await expect(relationship()?.public?.[1].follows_feeling).toBe(true);
    await expect(canvas.getByLabelText(`${member} toward player public label 2 hold`)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "+ Secret label" }));
    await expect(relationship()?.secret).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: `Remove ${member} toward player secret 2` }));
    await expect(relationship()?.secret?.map((row) => row.id)).toEqual(["loyal"]);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="relationship-labels-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
