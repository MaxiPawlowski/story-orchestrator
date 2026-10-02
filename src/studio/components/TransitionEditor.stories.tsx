import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import TransitionEditor from "./TransitionEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const meta: Meta<typeof TransitionEditor> = {
  title: "Studio/TransitionEditor",
  component: TransitionEditor,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof TransitionEditor>;

export const NarrowStudio: Story = {
  beforeEach: () => {
    const story = sampleStory();
    const long = { from: "the-sheridan-steward-who-keeps-the-ledgers", to: "road-to-wendhope-past-the-old-mill" };
    seedDraft({ ...story, transitions: story.transitions.map((transition, index) => (index === 0 ? { ...transition, ...long } : transition)) });
  },
  render: () => (
    <div data-so="narrow-frame" style={{ width: 345, overflow: "auto" }}>
      <TransitionEditor />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector('[data-so="narrow-frame"]') as HTMLElement;
    await expect(within(canvasElement).getByText(/the-sheridan-steward-who-keeps-the-ledgers/)).toBeInTheDocument();
    await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
  },
};

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("From")).toHaveValue("start");
    await expect(canvas.getByLabelText("To")).toHaveValue("infiltrate");
  },
};

export const GateReplayWithoutAChat: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="gate-replay"]')?.getAttribute("data-state")).toBe("unavailable");
    await expect(within(canvasElement).getByText(/Open the Studio from a chat that plays this story/)).toBeInTheDocument();
  },
};

export const EditPriority: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const priority = canvas.getByLabelText("Priority");
    await userEvent.clear(priority);
    await userEvent.type(priority, "5");
    await expect(useDraftStore.getState().draft.transitions[0].priority).toBe(5);
  },
};

export const AddAndDelete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Transition" }));
    await expect(useDraftStore.getState().draft.transitions).toHaveLength(3);
    await userEvent.click(canvas.getByRole("button", { name: "Delete transition" }));
    await expect(useDraftStore.getState().draft.transitions).toHaveLength(3);
    await expect(canvas.getByText("Click Delete again to confirm.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Delete transition" }));
    await expect(useDraftStore.getState().draft.transitions).toHaveLength(2);
  },
};

export const ProgressEffect: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Progress effect"));
    await expect(useDraftStore.getState().draft.transitions[0].effects?.progress?.anchor).toBe("cache");
  },
};
