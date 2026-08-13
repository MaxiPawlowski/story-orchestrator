import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import RosterEditor from "./RosterEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft, seedEmptyDraft } from "../stories/fixtures";

const meta: Meta<typeof RosterEditor> = {
  title: "Studio/RosterEditor",
  component: RosterEditor,
  args: { memberNames: ["Arin", "Ponticius", "Luke"] },
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof RosterEditor>;

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Member 1 id")).toHaveValue("guide");
    await expect(canvas.getByLabelText("Member 1 name")).toHaveValue("The Guide");
  },
};

export const EmptyThenAdd: Story = {
  beforeEach: () => {
    seedEmptyDraft();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/No cast yet/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "+ Member" }));
    await userEvent.type(canvas.getByLabelText("Member 1 name"), "Arin");
    await expect(useDraftStore.getState().draft.roster).toEqual([{ id: "member", name: "Arin" }]);
  },
};

export const RemoveMember: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Remove member 1" }));
    await expect(useDraftStore.getState().draft.roster).toEqual([]);
  },
};
