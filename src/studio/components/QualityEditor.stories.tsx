import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import QualityEditor from "./QualityEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft, seedEmptyDraft } from "../stories/fixtures";

const meta: Meta<typeof QualityEditor> = {
  title: "Studio/QualityEditor",
  component: QualityEditor,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof QualityEditor>;

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /trust/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /route/ }));
    await expect(canvas.getByLabelText("Enum value 1")).toHaveValue("stealth");
  },
};

export const AddAndRename: Story = {
  beforeEach: () => {
    seedEmptyDraft();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Quality" }));
    const keyInput = canvas.getByLabelText("Key");
    await expect(keyInput).toHaveValue("quality");
    await userEvent.clear(keyInput);
    await userEvent.type(keyInput, "morale");
    await expect(useDraftStore.getState().draft.qualities.map((quality) => quality.key)).toContain("morale");
  },
};

export const DeleteWithUsages: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^trust/ }));
    await userEvent.click(canvas.getByRole("button", { name: "Delete quality" }));
    await expect(canvas.getByText(/Used in 1 place/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Delete quality" }));
    await expect(useDraftStore.getState().draft.qualities.map((quality) => quality.key)).not.toContain("trust");
  },
};
