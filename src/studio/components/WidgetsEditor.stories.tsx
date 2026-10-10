import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import WidgetsEditor from "./WidgetsEditor";
import { useDraftStore } from "../draft";
import { gameStory, widgetStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof WidgetsEditor> = {
  title: "Studio/WidgetsEditor",
  component: WidgetsEditor,
};

export default meta;

type Story = StoryObj<typeof WidgetsEditor>;

const seeded = { beforeEach: () => { seedDraft(gameStory()); } };
const kinds = { beforeEach: () => { seedDraft(widgetStory()); } };

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

export const CluesMapAndHtml: Story = {
  ...kinds,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("clue-wall clues")).toBeVisible();
    await expect(canvas.getByLabelText("ruins-map image")).toHaveValue("ruins.jpg");
    await expect(canvas.getByLabelText("case-board template")).toHaveValue("<p>board</p>");
    await userEvent.clear(canvas.getByLabelText("ruins-map image"));
    await userEvent.type(canvas.getByLabelText("ruins-map image"), "river.png");
    await expect(useDraftStore.getState().draft.widgets?.[1].image).toBe("river.png");
  },
};

export const PreviewOverASample: Story = {
  ...kinds,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Preview clue-wall over a sample state"));
    const row = canvasElement.querySelector('[data-widget="clue-wall"]') as HTMLElement;
    await expect(within(row).getByText(/Not shown in this sample/)).toBeVisible();
    await userEvent.selectOptions(within(row).getByLabelText("clue-wall sample alarm"), "true");
    await expect(within(row).getByRole("list", { name: "clue-wall preview" })).toHaveTextContent("Someone rang the ruin bell.");
    await expect(within(row).getByRole("list", { name: "clue-wall preview" })).not.toHaveTextContent("side door");
  },
};

export const PreviewMapReached: Story = {
  ...kinds,
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-widget="ruins-map"]') as HTMLElement;
    await userEvent.click(within(row).getByText("Preview ruins-map over a sample state"));
    await expect(within(row).getByRole("list", { name: "ruins-map preview" })).not.toHaveTextContent("The cache");
    await userEvent.click(within(row).getByLabelText("ruins-map sample reached cache"));
    await expect(within(row).getByRole("list", { name: "ruins-map preview" })).toHaveTextContent("The cache at 70%, 30% (you are here)");
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="widgets-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
export const KindsPhone: Story = { ...kinds, ...fitsAt(VIEWPORTS.phone, primary) };
