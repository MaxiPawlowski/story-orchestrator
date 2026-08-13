import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import StoryEditor from "./StoryEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof StoryEditor> = {
  title: "Studio/StoryEditor",
  component: StoryEditor,
  args: {
    personaNames: ["Traveller"],
    memberNames: ["Arin", "Ponticius", "Luke"],
    lorebookNames: ["Xentar Checkpoints"],
  },
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof StoryEditor>;

export const NewStory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "From title" }));
    await expect(canvas.getByLabelText("Story id")).toHaveValue("the-ruins-heist");
    await expect(canvas.getByLabelText("Story version")).toHaveValue("1");
  },
};

export const IdLockedAfterSave: Story = {
  args: { idLocked: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Story id")).toBeDisabled();
  },
};

export const AuthorRequirements: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Cast member" }));
    await expect(canvas.getByLabelText("Cast member 1")).toHaveValue("Arin");
    await userEvent.click(canvas.getByRole("button", { name: "+ Lorebook" }));
    await expect(useDraftStore.getState().draft.requirements).toEqual({ members: ["Arin"], lorebooks: ["Xentar Checkpoints"] });
  },
};

export const ArcShapeAndBridges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("Dramatic shape"), "rising");
    await userEvent.click(canvas.getByRole("button", { name: "+ Bridge" }));
    await userEvent.type(canvas.getByLabelText("Bridge 1 keyword"), "relic");
    const draft = useDraftStore.getState().draft;
    await expect(draft.arc_template).toBe("rising");
    await expect(draft.arc_bridges).toEqual([{ arcMatch: "relic", anchor: "cache", amount: 1 }]);
  },
};
