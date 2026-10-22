import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import EchoesEditor from "./EchoesEditor";
import { useDraftStore } from "../draft";
import { echoStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof EchoesEditor> = {
  title: "Studio/EchoesEditor",
  component: EchoesEditor,
};

export default meta;

type Story = StoryObj<typeof EchoesEditor>;

const seeded = { beforeEach: () => { seedDraft(echoStory()); } };

const echoes = () => useDraftStore.getState().draft.echoes ?? [];

export const EditsEchoes: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Delayed echoes")).toBeVisible();
    await userEvent.type(canvas.getByLabelText("echo debt delay to"), "6", { initialSelectionStart: 0, initialSelectionEnd: 1 });
    await expect(echoes()[0].delay).toEqual({ boundaries: [2, 6] });
    await userEvent.type(canvas.getByLabelText("echo debt hold"), "3");
    await expect(echoes()[0].hold).toBe(3);
    await userEvent.clear(canvas.getByLabelText("echo debt cue"));
    await userEvent.type(canvas.getByLabelText("echo debt cue"), "the player feels guilty");
    await expect(canvas.getByRole("note")).toHaveTextContent("Says what the player does or feels");
    await userEvent.click(canvas.getByRole("button", { name: "+ Echo" }));
    await expect(echoes()).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Remove echo debt" }));
    await expect(echoes().map((echo) => echo.id)).toEqual(["echo"]);
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="echoes-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
