import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect, waitFor } from "@storybook/test";
import StudioToolbar from "./StudioToolbar";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof StudioToolbar> = {
  title: "Studio/StudioToolbar",
  component: StudioToolbar,
  args: { onRekeySession: fn() },
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
    await expect(await canvas.findByText(/Saved .* v1 to the library\./)).toBeInTheDocument();
    // A story saved without an authored id gets one derived from its title, so the next save
    // updates the same record instead of forking a new one (finding U2).
    await expect(useDraftStore.getState().draft.id).toMatch(/^the-ruins-heist/);
  },
};

export const SaveRekeysTheWizardSession: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const draftKey = useDraftStore.getState().draftKey;
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onRekeySession).toHaveBeenCalledWith(draftKey, expect.stringMatching(/^the-ruins-heist/)));
    await waitFor(() => expect(useDraftStore.getState().draftKey).toMatch(/^the-ruins-heist/));
  },
};

// v2.3 plan 09: two events, two sentences. The library half is the Studio's; the chat half is the
// runtime's, and a save can succeed without the chat taking it.
export const SaveAppliedToThisChat: Story = {
  args: { onSaved: fn(async () => ({ applied: true, detail: "this chat is playing the new version now" })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: expect.stringMatching(/^the-ruins-heist/), version: expect.any(Number) })));
    await expect(await canvas.findByText(/Saved .* v1 to the library\. Applied to this chat: this chat is playing the new version now\./)).toBeInTheDocument();
  },
};

export const SaveCancelledInThisChat: Story = {
  args: { onSaved: fn(async () => ({ applied: false, detail: "this chat keeps playing v30" })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText(/Saved .* v1 to the library\. Not applied to this chat: this chat keeps playing v30\./)).toBeInTheDocument();
  },
};

export const SaveNotTakenByTheChat: Story = {
  args: { onSaved: fn(async () => null) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText(/Saved .* v1 to the library\. Not applied to this chat: it is playing a different story\./)).toBeInTheDocument();
  },
};

// v2.4 plan 02 §7: the library half claims the save only on evidence the server holds it (H15).
export const SaveNotConfirmed: Story = {
  args: { confirmSave: fn(async () => ({ confirmed: false as const, reason: "the settings save answered 500" })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText(/Saving .* v1… not confirmed: the settings save answered 500\./)).toBeInTheDocument();
    await expect(canvas.queryByText(/Saved .* to the library\./)).toBeNull();
  },
};
