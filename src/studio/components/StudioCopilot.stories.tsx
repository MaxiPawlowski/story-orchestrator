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

// The interview: a thin premise gets questions, and answering them re-runs the stage with the
// answers folded into the conversation as one author turn.
const INTERVIEW_THEN_PROPOSAL = (() => {
  let call = 0;
  return (input: AuthoringStageInput) => {
    call += 1;
    return runAuthoringStage(input, {
      profileId: null,
      debugResponse: call === 1
        ? JSON.stringify({ summary: "Two calls would change the shape.", questions: [{ id: "tone", text: "Comic or grim?", why: "it sets the tension curve", options: ["comic", "grim"] }] })
        : VALID_RESPONSE,
    });
  };
})();

export const InterviewsBeforeProposing: Story = {
  args: { enabled: true, runStage: INTERVIEW_THEN_PROPOSAL },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Copilot message"), "a heist, but strange");
    await userEvent.click(canvas.getByRole("button", { name: "Run stage" }));
    await expect(await canvas.findByLabelText("Wizard questions")).toBeInTheDocument();
    await expect(canvas.getByText("Comic or grim?")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "grim" }));
    await userEvent.click(canvas.getByRole("button", { name: "Send answers" }));
    await expect(await canvas.findByLabelText("Copilot proposal")).toBeInTheDocument();
    await expect(canvas.getByText(/Comic or grim\? → grim/)).toBeInTheDocument();
  },
};

const PROVISIONING_RESPONSE = JSON.stringify({
  summary: "This story needs one card.",
  ops: [{ kind: "createCharacterCard", name: "Arin", description: "A guide who knows the ruins." }],
});

export const ProvisioningCreatesAndRequires: Story = {
  args: {
    enabled: true,
    initialStage: "provisioning",
    runStage: stageRunner(PROVISIONING_RESPONSE),
    host: {
      environment: () => ({ characterNames: [], lorebookNames: [], groupNames: [], storyLorebooks: [] }),
      applyProvisioning: async () => ({ ok: true, message: 'Created the character card "Arin".', created: "Arin" }),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Run stage" }));
    await expect(await canvas.findByLabelText("Provisioning steps")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Create it" }));
    await expect(await canvas.findByRole("button", { name: "Created" })).toBeDisabled();
    // Applying makes the story *require* what was created, which is what turns the dots green.
    await expect(useDraftStore.getState().draft.requirements?.members).toContain("Arin");
    await expect(useDraftStore.getState().draft.roster.map((member) => member.name)).toContain("Arin");
  },
};
