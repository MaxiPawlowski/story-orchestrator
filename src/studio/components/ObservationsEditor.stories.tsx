import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import ObservationsEditor from "./ObservationsEditor";
import { useDraftStore } from "../draft";
import { observationStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof ObservationsEditor> = {
  title: "Studio/ObservationsEditor",
  component: ObservationsEditor,
};

export default meta;

type Story = StoryObj<typeof ObservationsEditor>;

const seeded = { beforeEach: () => { seedDraft(observationStory()); } };

const list = () => useDraftStore.getState().draft.observations ?? [];

export const EditsLines: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("note")).toHaveLength(1);
    await expect(canvas.getByRole("note")).toHaveTextContent("Says what the player feels or concludes. Tells the player what to do.");
    await userEvent.click(canvas.getByRole("button", { name: "+ Detail" }));
    await expect(list()).toHaveLength(3);
    await userEvent.selectOptions(canvas.getByLabelText("scratches noticed when"), "gate");
    await expect(list()[0].when).toEqual({ all: [] });
    await userEvent.click(canvas.getByLabelText("scratches passive roll"));
    await expect(list()[0].passive).toEqual({ roll: { sides: 20, target: 10 } });
    await userEvent.click(canvas.getByLabelText("pitch passive roll"));
    await expect(list()[1].passive).toBeUndefined();
    await userEvent.click(canvas.getByLabelText("Show what the player notices"));
    await expect(useDraftStore.getState().draft.display?.observations).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: "Remove observation scratches" }));
    await expect(list().map((item) => item.id)).toEqual(["pitch", "detail"]);
  },
};

export const Empty: Story = {
  beforeEach: () => { seedDraft({ ...observationStory(), observations: undefined }); },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "+ Detail" }));
    await expect(list()[0]?.id).toBe("detail");
  },
};

const editor = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-observations-editor");

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, editor) };
