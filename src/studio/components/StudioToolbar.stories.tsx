import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect, waitFor } from "@storybook/test";
import StudioToolbar from "./StudioToolbar";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof StudioToolbar> = {
  title: "Studio/StudioToolbar",
  component: StudioToolbar,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof StudioToolbar>;

export const SaveToLibrary: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText(/Saved .* v1 to library/)).toBeInTheDocument();
    // A story saved without an authored id gets one derived from its title, so the next save
    // updates the same record instead of forking a new one (finding U2).
    await expect(useDraftStore.getState().draft.id).toMatch(/^the-ruins-heist/);
  },
};

export const SaveOffersTheUpdateToTheChat: Story = {
  args: { onSaved: fn(async () => "This chat is playing it now.") },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringMatching(/^the-ruins-heist/), version: expect.any(Number) })));
    await expect(await canvas.findByText(/This chat is playing it now\./)).toBeInTheDocument();
  },
};
