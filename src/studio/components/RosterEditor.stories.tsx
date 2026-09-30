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

export const AuthorsADriveAndNarratorView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Member 1 drive"), "find the lost map");
    await userEvent.click(canvas.getByLabelText("Member 1 narrator view"));
    await expect(useDraftStore.getState().draft.roster[0]).toMatchObject({ id: "guide", drive: "find the lost map", view: "omniscient" });
    await userEvent.clear(canvas.getByLabelText("Member 1 drive"));
    await userEvent.click(canvas.getByLabelText("Member 1 narrator view"));
    await expect(useDraftStore.getState().draft.roster[0]).toEqual({ id: "guide", name: "The Guide" });
  },
};

export const RemoveMember: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Remove member 1" }));
    await expect(useDraftStore.getState().draft.roster).toEqual([]);
  },
};

export const AuthorsARole: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Member 1 role"), "keeper of the ruin maps");
    await expect(useDraftStore.getState().draft.roster[0]).toMatchObject({ id: "guide", role: "keeper of the ruin maps" });
    await userEvent.clear(canvas.getByLabelText("Member 1 role"));
    await expect(useDraftStore.getState().draft.roster[0].role).toBeUndefined();
  },
};

export const RolesHintOnlyForDirectedStories: Story = {
  beforeEach: () => {
    const story = sampleStory();
    seedDraft({ ...story, checkpoints: story.checkpoints.map((checkpoint, index) => (index === 0 ? { ...checkpoint, talk_control: { lead: "guide" } } : checkpoint)) });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("[data-so=roster-roles-hint]")?.textContent).toContain("Missing: The Guide");
    await userEvent.type(canvas.getByLabelText("Member 1 role"), "keeper of the ruin maps");
    await expect(canvasElement.querySelector("[data-so=roster-roles-hint]")).toBeNull();
  },
};
