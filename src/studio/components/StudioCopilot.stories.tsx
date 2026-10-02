import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import { newAgentSession } from "@copilot/agent/index";
import { emptyEnvironment, newWizardSession } from "@wizard/index";
import { runAuthoringStage, type AuthoringStageInput } from "@copilot/index";
import { routedModel } from "@extraction/client";
import StudioCopilot from "./StudioCopilot";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft, seedEmptyDraft } from "../stories/fixtures";

const VALID_RESPONSE = JSON.stringify({
  summary: "Add a morale quality.",
  ops: [{ kind: "addQuality", quality: { key: "morale", type: "int", source: "extractor", rubric: "How high is party morale, 0-5?" } }],
});

const INVALID_RESPONSE = JSON.stringify({
  summary: "Broken.",
  ops: [{ kind: "addTransition", transition: { from: "start", to: "cache", gate: { q: "ghost", op: "==", v: true }, priority: 0 } }],
});

const stageRunner = (debugResponse: string) => (input: AuthoringStageInput) => runAuthoringStage(input, routedModel(null), { role: "authoring", pass: "copilot", debugResponse });

const meta: Meta<typeof StudioCopilot> = {
  title: "Studio/StudioCopilot",
  component: StudioCopilot,
  args: { onModeChange: fn() },
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
    await userEvent.type(canvas.getByLabelText("Message to the wizard"), "Give the party a morale stat.");
    await userEvent.click(canvas.getByRole("button", { name: "Run stage" }));
    await expect(await canvas.findByLabelText("Wizard proposal")).toBeInTheDocument();
    await expect(canvas.getByText(/Add quality "morale"/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Accept all" }));
    await expect(useDraftStore.getState().draft.qualities.map((quality) => quality.key)).toContain("morale");
  },
};

// v2.3 plan 09 fixtures: the two states an author hits before anything is wrong with their story —
// a model call that takes a while, and the wizard being unavailable at all.
export const WorkingWhileTheModelRuns: Story = {
  args: { enabled: true, runStage: () => new Promise(() => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Run stage" }));
    await expect(canvas.getByRole("button", { name: "Working…" })).toBeDisabled();
  },
};

const WIZARD_FAILED = "The wizard request failed. Try again; the details are in the browser console.";

export const ThrownErrorShowsTheConstant: Story = {
  args: {
    enabled: true,
    runStage: async () => {
      throw new Error("socket hang up at http://127.0.0.1:18080/v1 key=sk-secret");
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const log = canvas.getByRole("log", { name: "Wizard conversation" });
    await expect(log).toHaveAttribute("aria-live", "polite");
    await userEvent.type(canvas.getByLabelText("Message to the wizard"), "A heist in the sun ruins.");
    await userEvent.click(canvas.getByRole("button", { name: "Run stage" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert.textContent).toBe(WIZARD_FAILED);
    await expect(alert.textContent).not.toContain("socket hang up");
    await expect(alert.textContent).not.toContain("sk-secret");
    await expect(canvas.getByRole("button", { name: "Run stage" })).toBeEnabled();
  },
};

export const UnavailableWithoutAProfile: Story = {
  args: { enabled: false, runStage: stageRunner(VALID_RESPONSE) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Wizard unavailable")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Run stage" })).toBeNull();
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
    await expect(canvas.getByLabelText("Wizard unavailable")).toBeInTheDocument();
  },
};

// The interview: a thin premise gets questions, and answering them re-runs the stage with the
// answers folded into the conversation as one author turn.
const INTERVIEW_THEN_PROPOSAL = (() => {
  let call = 0;
  return (input: AuthoringStageInput) => {
    call += 1;
    return runAuthoringStage(input, routedModel(null), {
      role: "authoring",
      pass: "copilot",
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
    await userEvent.type(canvas.getByLabelText("Message to the wizard"), "a heist, but strange");
    await userEvent.click(canvas.getByRole("button", { name: "Run stage" }));
    await expect(await canvas.findByLabelText("Wizard questions")).toBeInTheDocument();
    await expect(canvas.getByText("Comic or grim?")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "grim" }));
    await userEvent.click(canvas.getByRole("button", { name: "Send answers" }));
    await expect(await canvas.findByLabelText("Wizard proposal")).toBeInTheDocument();
    await expect(canvas.getByText(/Comic or grim\? → grim/)).toBeInTheDocument();
  },
};

const PROVISIONING_RESPONSE = JSON.stringify({
  summary: "This story needs one card.",
  ops: [{ kind: "createCharacterCard", name: "Arin", description: "A guide who knows the ruins." }],
});

// v2.3 plan 09: five stages, four things an author is doing. The steps are the control; the stage
// names are the machine's and sit behind Details.
export const StepsHideTheStageNames: Story = {
  args: { enabled: true, runStage: stageRunner(VALID_RESPONSE) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const steps = [...canvasElement.querySelectorAll('[data-so="wizard-step"]')];
    await expect(steps.map((step) => step.getAttribute("data-step"))).toEqual(["premise", "turningPoints", "characters", "setup"]);
    await expect(canvas.getByText("What the story is about, and what it measures as it goes.")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="wizard-stage-details"]')).not.toHaveAttribute("open");
    await userEvent.click(canvas.getByText("Turning points"));
    await expect(canvas.getByText("The beats, and what has to be true to move between them.")).toBeInTheDocument();
    // The step names what the wizard will propose in the author's words, not the stage's.
    await expect(canvas.getByPlaceholderText("Turning points: tell the wizard what you want, or ask a question.")).toBeInTheDocument();
  },
};

export const ProvisioningCreatesAndRequires: Story = {
  args: {
    enabled: true,
    initialStage: "provisioning",
    runStage: stageRunner(PROVISIONING_RESPONSE),
    host: {
      environment: () => ({ characterNames: [], lorebookNames: [], groupNames: [], storyLorebooks: [], ownedLorebooks: [], grantedLorebooks: [], castNames: [], personaNames: [] }),
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

export const AgentModeSitsBesideTheStagedWizard: Story = {
  args: {
    enabled: true,
    runStage: stageRunner(VALID_RESPONSE),
    runAgentTurn: async (session) => ({ session, apply: null }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="wizard-mode"][data-mode="staged"]')).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: "Run stage" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await expect(canvas.getByLabelText("What should the agent build")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Run stage" })).toBeNull();
  },
};

export const AgentSessionBelongsToItsDraft: Story = {
  beforeEach: () => {
    seedEmptyDraft();
  },
  args: {
    enabled: true,
    runStage: stageRunner(VALID_RESPONSE),
    runAgentTurn: async (session) => ({ session, apply: null }),
    host: {
      environment: () => emptyEnvironment(),
      applyProvisioning: async () => ({ ok: true, message: "" }),
      loadSession: (key) => (key === "untitled-story"
        ? { ...newWizardSession(key), agent: { ...newAgentSession("The previous story's first run."), status: "stopped" } }
        : null),
      saveSession: () => undefined,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Agent" }));
    await expect(canvas.getByLabelText("What should the agent build")).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-agent-status")).toBeNull();
  },
};
