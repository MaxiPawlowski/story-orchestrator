import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import WidgetsEditor from "./WidgetsEditor";
import { useDraftStore } from "../draft";
import { gameStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof WidgetsEditor> = {
  title: "Studio/WidgetsEditor",
  component: WidgetsEditor,
};

export default meta;

type Story = StoryObj<typeof WidgetsEditor>;

const seeded = { beforeEach: () => { seedDraft(gameStory()); } };

export const ChangesKind: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("alarm-clock kind"), "meters");
    await expect(useDraftStore.getState().draft.widgets?.[0].kind).toBe("meters");
    await userEvent.click(canvas.getByRole("button", { name: "Remove panel alarm-clock" }));
    await expect(useDraftStore.getState().draft.widgets).toBeUndefined();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="widgets-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
