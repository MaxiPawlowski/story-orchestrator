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

// v2.2 plan 06: how the judge reads a quality, and the exact request it would send.
export const JudgeReading: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /route/ }));
    const reading = canvas.getByLabelText("Judge reading");
    await expect([...(reading as HTMLSelectElement).options].map((option) => option.value)).toEqual(["", "choice"]);
    await userEvent.selectOptions(reading, "choice");
    await userEvent.type(canvas.getByLabelText("stealth means"), "Sneaking past unseen");
    await userEvent.type(canvas.getByLabelText("stealth not for"), "Hiding after being spotted");
    const route = () => useDraftStore.getState().draft.qualities.find((quality) => quality.key === "route");
    await expect(route()?.read_as).toBe("choice");
    await expect(route()?.criteria).toEqual({ stealth: { what: "Sneaking past unseen", not_for: "Hiding after being spotted" } });
    await userEvent.click(canvas.getByRole("button", { name: "Preview request" }));
    const preview = canvasElement.querySelector("[data-so=\"quality-read-preview\"]");
    await expect(preview?.textContent).toContain("\"Sneaking past unseen\"");
    await expect(preview?.textContent).toContain("\"not shown\"");
    await userEvent.selectOptions(canvas.getByLabelText("Type"), "int");
    await expect(route()?.read_as).toBeUndefined();
  },
};
