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

const RECORD_IDS = ["so-chapter-seal", "so-chapter-fold", "so-chapter-story-so-far", "so-chapter-budget"];

export const PreviouslyIsOnByDefault: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText(/Show "Previously…"/)).toBeChecked();
    await userEvent.click(canvas.getByLabelText(/Show "Previously…"/));
    await expect(args.manager.setMemorySettings).toHaveBeenCalledWith({ chapters: expect.objectContaining({ recap: false }) });
  },
};

export const ReleaseBuildHasNoChapterRecordsEvenInAuthorView: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-chapter-recap")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-chapter-advanced")).toBeNull();
    for (const id of RECORD_IDS) await expect(canvasElement.querySelector(`#${id}`)).toBeNull();
  },
};

export const PlayerSeesOnlyThePreviouslyToggle: Story = {
  args: { snapshot: snapshot(undefined, false) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-chapter-recap")).not.toBeNull();
    for (const id of RECORD_IDS) await expect(canvasElement.querySelector(`#${id}`)).toBeNull();
  },
};
