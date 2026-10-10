import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import { advanceAgent, AgentRouteUnavailable, DEFAULT_AGENT_BUDGET, newAgentSession, type AgentRoute } from "@copilot/agent/index";
import { agentContext, scriptedRoute } from "@copilot/agent/testing";
import { emptyEnvironment } from "@wizard/index";
import AgentWizard, { type AgentTurnRunner } from "./AgentWizard";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const scripted = (replies: Array<Record<string, unknown>>): AgentTurnRunner => {
  let route: AgentRoute | null = null;
  return (session, draft) => {
    if (!route || (session.status === "planning" && session.steps.length === 0)) route = scriptedRoute(replies).route;
    return advanceAgent(session, agentContext(draft, { ...emptyEnvironment(), groupNames: [draft.title] }), route);
  };
};

const PLAN = { plan: ["Sharpen the opening objective", "Finish"] };
const OBJECTIVE = { thought: "the opening is vague", tool: "updateCheckpoint", args: { id: "start", patch: { objective: "Reach the ruins gate before the patrol turns." } } };
const DONE = { done: "Sharpened the opening beat." };

const meta: Meta<typeof AgentWizard> = {
  title: "Studio/AgentWizard",
  component: AgentWizard,
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof AgentWizard>;

const planAndGo = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByLabelText("What should the agent build"), "A heist in the sun ruins.");
  await userEvent.click(canvas.getByRole("button", { name: "Plan it" }));
  await expect(await canvas.findByLabelText("The agent's plan")).toHaveValue("Sharpen the opening objective\nFinish");
  await userEvent.click(canvas.getByRole("button", { name: "Go" }));
  return canvas;
};

export const PlanThenReviewOneChange: Story = {
  args: { runTurn: scripted([PLAN, OBJECTIVE, DONE]), onPersist: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = await planAndGo(canvasElement);
    await expect(await canvas.findByLabelText("Agent change")).toBeInTheDocument();
    await expect(args.onPersist).toHaveBeenLastCalledWith(expect.objectContaining({ status: "awaiting-author" }));
    await expect(canvas.getByText('Update checkpoint "start"')).toBeInTheDocument();
    await expect(canvas.getByLabelText("After")).toHaveTextContent("Reach the ruins gate before the patrol turns.");
    await expect(useDraftStore.getState().draft.checkpoints[0].objective).toBe("Reach the ruins gate.");
    await userEvent.click(canvas.getByRole("button", { name: "Accept" }));
    await expect(await canvas.findByText(/Sharpened the opening beat\./)).toBeInTheDocument();
    await expect(useDraftStore.getState().draft.checkpoints[0].objective).toBe("Reach the ruins gate before the patrol turns.");
  },
};

export const RejectSendsTheReasonBack: Story = {
  args: { runTurn: scripted([PLAN, OBJECTIVE, DONE]), onPersist: fn() },
  play: async ({ canvasElement }) => {
    const canvas = await planAndGo(canvasElement);
    await canvas.findByLabelText("Agent change");
    await userEvent.type(canvas.getByLabelText("Why not"), "keep the patrol out of it");
    await userEvent.click(canvas.getByRole("button", { name: "Reject" }));
    await canvas.findByText(/Sharpened the opening beat\./);
    await expect(canvasElement.querySelector('[data-so="agent-step"][data-status="rejected"]')).not.toBeNull();
    await expect(useDraftStore.getState().draft.checkpoints[0].objective).toBe("Reach the ruins gate.");
  },
};

const PROVISION = { thought: "the guide needs a card", tool: "createCharacterCard", args: { name: "The Guide", description: "Knows the ruins." } };

export const AutoDraftWritesButAssetsWait: Story = {
  args: {
    runTurn: scripted([PLAN, OBJECTIVE, PROVISION, DONE]),
    onPersist: fn(),
    host: {
      environment: () => emptyEnvironment(),
      applyProvisioning: fn(async () => ({ ok: true, message: 'Created the character card "The Guide".', created: "The Guide" })),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("What should the agent build"), "A heist.");
    await userEvent.selectOptions(canvas.getByLabelText("Agent mode"), "auto-draft");
    await userEvent.click(canvas.getByRole("button", { name: "Plan it" }));
    await canvas.findByLabelText("The agent's plan");
    await userEvent.click(canvas.getByRole("button", { name: "Go" }));
    await expect(await canvas.findByLabelText("Agent asset")).toBeInTheDocument();
    await expect(useDraftStore.getState().draft.checkpoints[0].objective).toBe("Reach the ruins gate before the patrol turns.");
    await expect(args.host?.applyProvisioning).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Create it" }));
    await canvas.findByText(/Sharpened the opening beat\./);
    await expect(args.host?.applyProvisioning).toHaveBeenCalledTimes(1);
    await expect(useDraftStore.getState().draft.requirements?.members).toContain("The Guide");
  },
};

export const CoverageListsUnusedFields: Story = {
  args: { runTurn: scripted([PLAN]), onPersist: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Coverage/));
    await expect(canvas.getByText("House rules")).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-so="coverage-row"]').length).toBeGreaterThan(3);
  },
};

const AGENT_FAILED = "The agent call failed. Try again; the details are in the browser console.";

const failingRunner: AgentTurnRunner = async () => {
  throw new Error("ECONNRESET at 127.0.0.1:18080 token=sk-secret");
};

export const ErrorShowsTheConstantNotTheCause: Story = {
  args: { runTurn: failingRunner, onPersist: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("What should the agent build"), "A heist in the sun ruins.");
    await userEvent.click(canvas.getByRole("button", { name: "Plan it" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(AGENT_FAILED);
    await expect(alert.textContent).toBe(AGENT_FAILED);
    await expect(alert.textContent).not.toContain("ECONNRESET");
    await expect(alert.textContent).not.toContain("sk-secret");
    await expect(canvas.getByRole("button", { name: "Retry" })).toBeEnabled();
    await expect(canvasElement.querySelector("#so-agent-status")).toHaveTextContent("Failed");
  },
};

export const FallbackSaysWhichModelAnswered: Story = {
  args: {
    runTurn: scripted([PLAN]),
    onPersist: fn(),
    initial: {
      ...newAgentSession("A heist in the sun ruins."), plan: PLAN.plan, status: "awaiting-plan",
      fallback: "opencode · openai/gpt-6-astra-fast could not answer (quota: opencode reports its usage limit), so deepseek 4.1 flash answered instead.",
    },
  },
  play: async ({ canvasElement }) => {
    const notice = canvasElement.querySelector('[data-so="agent-fell-back"]');
    await expect(notice).toHaveTextContent("could not answer (quota: opencode reports its usage limit)");
    await expect(notice).toHaveTextContent("deepseek 4.1 flash answered instead");
  },
};

export const StoppedOffersContinueAndNewGoal: Story = {
  args: {
    runTurn: scripted([PLAN]),
    onPersist: fn(),
    initial: { ...newAgentSession("A heist in the sun ruins."), plan: PLAN.plan, status: "stopped" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-agent-status")).toHaveTextContent("Stopped");
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
    await expect(canvas.getByLabelText("Agreed plan")).toHaveTextContent("1. Sharpen the opening objective");
    await userEvent.click(canvas.getByRole("button", { name: "New goal" }));
    await expect(args.onPersist).toHaveBeenLastCalledWith(null);
    await expect(await canvas.findByLabelText("What should the agent build")).toBeInTheDocument();
  },
};

export const DoneSaysWhatHappensNext: Story = {
  args: {
    runTurn: scripted([PLAN]),
    onPersist: fn(),
    initial: { ...newAgentSession("A heist in the sun ruins."), plan: PLAN.plan, status: "done", summary: "Sharpened the opening beat." },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-agent-status")).toHaveTextContent("Finished");
    const done = canvasElement.querySelector('[data-so="agent-done"]');
    await expect(done).toHaveTextContent("Sharpened the opening beat.");
    await expect(done).toHaveTextContent("nothing reaches the library until you do");
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
    await expect(canvas.queryByLabelText("Agent change")).toBeNull();
  },
};

export const StoppedOnARepeatSaysWhy: Story = {
  args: {
    runTurn: scripted([PLAN]),
    onPersist: fn(),
    initial: {
      ...newAgentSession("A heist in the sun ruins."), plan: PLAN.plan, status: "stopped",
      stopReason: "Stopped: the agent sent the same refused updateCheckpoint call 3 times (steps #4, #6, #8). Tell the agent what to do instead in a note, then Continue.",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="agent-stop-reason"]')).toHaveTextContent("same refused updateCheckpoint call 3 times");
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
  },
};

const harnessRefused: AgentTurnRunner = async () => {
  throw new AgentRouteUnavailable("harness", "opencode offers no agent tool bridge on this install (the plugin's config.json offers it, opencode only)");
};

export const SetupFailureShowsItsReason: Story = {
  args: { runTurn: harnessRefused, onPersist: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("What should the agent build"), "A heist in the sun ruins.");
    await userEvent.click(canvas.getByRole("button", { name: "Plan it" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent("The agent call failed: opencode offers no agent tool bridge on this install");
  },
};

export const UnavailableWithoutAModel: Story = {
  args: { runTurn: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("Agent unavailable")).toBeInTheDocument();
  },
};

export const OutOfBudgetContinueGrantsAFreshSlice: Story = {
  args: {
    runTurn: scripted([DONE]),
    onPersist: fn(),
    initial: {
      ...newAgentSession("A heist in the sun ruins."),
      plan: PLAN.plan,
      status: "budget",
      budget: { ...DEFAULT_AGENT_BUDGET, usedTokens: DEFAULT_AGENT_BUDGET.maxTokens + 100 },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-agent-status")).toHaveTextContent("Out of budget");
    await expect(canvasElement.querySelector('[data-so="agent-budget-note"]')).toHaveTextContent("Continue grants a fresh budget: 60 more steps, ~240k tokens.");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText(/Sharpened the opening beat\./)).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-agent-status")).toHaveTextContent("Finished");
  },
};
