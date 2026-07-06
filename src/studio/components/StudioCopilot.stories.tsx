import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import { runAuthoringStage, type AuthoringStageInput } from "@copilot/index";
import StudioCopilot from "./StudioCopilot";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const VALID_RESPONSE = JSON.stringify({
  summary: "Add a morale quality.",
  ops: [{ kind: "addQuality", quality: { key: "morale", type: "int", source: "extractor", rubric: "How high is party morale, 0-5?" } }],
});

const INVALID_RESPONSE = JSON.stringify({
  summary: "Broken.",
  ops: [{ kind: "addTransition", transition: { from: "start", to: "cache", gate: { q: "ghost", op: "==", v: true }, priority: 0 } }],
});

const stageRunner = (debugResponse: string) => (input: AuthoringStageInput) => runAuthoringStage(input, { profileId: null, debugResponse });

const meta: Meta<typeof StudioCopilot> = {
  title: "Studio/StudioCopilot",
  component: StudioCopilot,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof StudioCopilot>;

export const ProposeAndAcceptAll: Story = {
  args: { enabled: true, runStage: stageRunner(VALID_RESPONSE) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Copilot message"), "Give the party a morale stat.");
    await userEvent.click(canvas.getByRole("button", { name: "Run stage" }));
    await expect(await canvas.findByLabelText("Copilot proposal")).toBeInTheDocument();
    await expect(canvas.getByText(/Add quality "morale"/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Accept all" }));
    await expect(useDraftStore.getState().draft.qualities.map((quality) => quality.key)).toContain("morale");
  },
};

export const InvalidProposal: Story = {
  args: { enabled: true, runStage: stageRunner(INVALID_RESPONSE) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Run stage" }));
    await expect(await canvas.findByText("Invalid proposal")).toBeInTheDocument();
    await expect(useDraftStore.getState().draft.qualities.map((quality) => quality.key)).not.toContain("morale");
  },
};

export const Disabled: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Copilot unavailable")).toBeInTheDocument();
  },
};
