import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import PatternsEditor from "./PatternsEditor";
import { useDraftStore } from "../draft";
import { patternStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof PatternsEditor> = {
  title: "Studio/PatternsEditor",
  component: PatternsEditor,
};

export default meta;

type Story = StoryObj<typeof PatternsEditor>;

const seeded = { beforeEach: () => { seedDraft(patternStory()); } };

const pattern = () => useDraftStore.getState().draft.patterns?.[0];

export const StepsAndLines: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Step" }));
    await expect(pattern()?.steps).toHaveLength(3);
    await expect(canvas.getByRole("button", { name: "+ Step" })).toBeDisabled();
    await userEvent.selectOptions(canvas.getByLabelText("two-favours step 3 kind"), "check");
    await expect(pattern()?.steps[2]).toEqual({ kind: "check" });
    await userEvent.type(canvas.getByLabelText("two-favours step 3 outcome"), "success");
    await expect(pattern()?.steps[2]).toEqual({ kind: "check", to: "success" });
    await userEvent.click(canvas.getByLabelText("Remove two-favours step 3"));
    await expect(pattern()?.steps).toHaveLength(2);
    await userEvent.selectOptions(canvas.getByLabelText("two-favours repeat"), "each");
    await expect(pattern()?.repeat).toBe("each");
    await userEvent.type(canvas.getByLabelText("two-favours narrator hint"), "Let the patron warm.");
    await expect(pattern()?.hint).toBe("Let the patron warm.");
    await userEvent.clear(canvas.getByLabelText("two-favours one step left"));
    await expect(pattern()?.pending).toBeUndefined();
    await userEvent.click(canvas.getByRole("button", { name: "+ Pattern" }));
    await expect(useDraftStore.getState().draft.patterns).toHaveLength(2);
    await userEvent.click(canvas.getByLabelText("Remove pattern two-favours"));
    await expect(useDraftStore.getState().draft.patterns?.map((entry) => entry.id)).toEqual(["pattern"]);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="patterns-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
