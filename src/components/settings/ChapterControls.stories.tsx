import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { ChapterControls } from "./ChapterControls";

const snapshot = (chapters?: Record<string, unknown>, authorView = true): RuntimeSnapshot => ({ memory: { settings: { chapters } }, ui: { authorView } }) as unknown as RuntimeSnapshot;

const fakeManager = () => ({ setMemorySettings: fn() }) as unknown as RuntimeManager;

const meta: Meta<typeof ChapterControls> = {
  title: "Settings/ChapterControls",
  component: ChapterControls,
  args: { snapshot: snapshot() },
};

export default meta;

type Story = StoryObj<typeof ChapterControls>;

export const OffByDefault: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Write a record when a chapter ends")).not.toBeChecked();
    await expect(canvas.getByLabelText("Add the story so far to every prompt")).not.toBeChecked();
    await expect(canvas.getByLabelText(/Leave ended chapters' messages out/)).not.toBeChecked();
    await expect(canvas.getByLabelText(/Show "Previously…"/)).toBeChecked();
    await expect(canvas.getByLabelText("Story so far budget")).toHaveValue("700");
  },
};

export const SwitchOnAndPickAnArm: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Write a record when a chapter ends"));
    await expect(args.manager.setMemorySettings).toHaveBeenCalledWith({ chapters: expect.objectContaining({ seal: true, chronicleTokens: 700 }) });
    await userEvent.selectOptions(canvas.getByLabelText("Story so far budget"), "400");
    await expect(args.manager.setMemorySettings).toHaveBeenLastCalledWith({ chapters: expect.objectContaining({ chronicleTokens: 400 }) });
  },
};

export const PlayerSeesOnlyThePreviouslyToggle: Story = {
  args: { snapshot: snapshot(undefined, false) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-chapter-recap")).not.toBeNull();
    for (const id of ["so-chapter-seal", "so-chapter-fold", "so-chapter-story-so-far", "so-chapter-budget"]) await expect(canvasElement.querySelector(`#${id}`)).toBeNull();
  },
};
