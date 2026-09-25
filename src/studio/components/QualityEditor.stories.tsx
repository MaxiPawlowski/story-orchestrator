import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import QualityEditor from "./QualityEditor";
import { useDraftStore } from "../draft";
import { longNameStory, sampleStory, seedDraft, seedEmptyDraft } from "../stories/fixtures";

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
// v2.3 plan 09 fixture: a key that is a sentence, a rubric that is a paragraph and twelve options.
export const LongNames: Story = {
  beforeEach: () => {
    seedDraft(longNameStory());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /how_completely_the_party_has_earned_the_trust/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /the_road_the_party_took_through_the_flooded/ }));
    await expect(canvas.getByLabelText("Enum value 12")).toHaveValue("the ferry");
    await expect((canvas.getByLabelText("Rubric") as HTMLTextAreaElement).value).toContain("Which of the twelve ways through the flooded quarter the party actually used.");
  },
};

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

// v2.4 plan 04 T15: which lines can prove a value. Absent is today's behaviour; "decided" says the
// author chose it, which silences the Studio's suggestion; code qualities read no evidence at all.
export const EvidenceFromWorld: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /alarm/ }));
    const evidence = canvas.getByLabelText("Evidence may come from");
    const alarm = () => useDraftStore.getState().draft.qualities.find((quality) => quality.key === "alarm");
    await expect(evidence).toHaveValue("");
    await expect(evidence).toBeEnabled();
    await userEvent.selectOptions(evidence, "world");
    await expect(alarm()?.evidence_from).toBe("world");
    await userEvent.selectOptions(evidence, "any");
    await expect(alarm()?.evidence_from).toBe("any");
    await userEvent.selectOptions(canvas.getByLabelText("Source"), "code");
    await expect(alarm()?.evidence_from).toBeUndefined();
    await expect(canvas.getByLabelText("Evidence may come from")).toBeDisabled();
  },
};
