import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { ChapterControls } from "./ChapterControls";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

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

export const AuthorViewShowsChapterRecordsOnByDefault: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-chapter-recap")).not.toBeNull();
    await waitFor(() => expect(canvasElement.querySelector("#so-chapter-advanced")).not.toBeNull());
    for (const id of RECORD_IDS) await expect(canvasElement.querySelector(`#${id}`)).not.toBeNull();
    for (const id of RECORD_IDS.filter((id) => id !== "so-chapter-budget")) await expect(canvasElement.querySelector<HTMLInputElement>(`#${id}`)?.checked).toBe(true);
  },
};

const author = { args: { manager: fakeManager() } };
const openRecords = async (canvasElement: HTMLElement) => within(canvasElement).getByLabelText(/Show "Previously…"/);

export const Phone: Story = { ...author, ...fitsAt(VIEWPORTS.phone, openRecords) };
export const Tablet: Story = { ...author, ...fitsAt(VIEWPORTS.tablet, openRecords) };
export const Wide: Story = { ...author, ...fitsAt(VIEWPORTS.wide, openRecords) };

export const PlayerSeesOnlyThePreviouslyToggle: Story = {
  args: { snapshot: snapshot(undefined, false) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-chapter-recap")).not.toBeNull();
    for (const id of RECORD_IDS) await expect(canvasElement.querySelector(`#${id}`)).toBeNull();
  },
};
