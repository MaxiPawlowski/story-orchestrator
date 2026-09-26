import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import { parseProposal, type ProposalResult } from "@copilot/index";
import ProposalReview from "./ProposalReview";
import { DIAGNOSTIC_CONSEQUENCES } from "../diagnostics";

const okProposal = parseProposal(JSON.stringify({
  summary: "Add a morale quality and make the cache convergent.",
  ops: [
    { kind: "addQuality", quality: { key: "morale", type: "int", source: "extractor", rubric: "How high is party morale?" } },
    { kind: "updateCheckpoint", id: "cache", patch: { convergence_threshold: 2 } },
  ],
})).proposal;

const okResult: ProposalResult = {
  stage: "qualities",
  proposal: okProposal,
  preview: {
    errors: [],
    diagnostics: [{
      code: "threshold-unsatisfiable",
      severity: "warning",
      path: "checkpoints.2",
      message: "cache threshold 2 exceeds available progress 0",
      consequence: DIAGNOSTIC_CONSEQUENCES["threshold-unsatisfiable"],
    }],
  },
  status: "ok",
  issues: [],
  questions: [],
  audit: { prompt: "", rawResponse: "", finish: "stop" },
};

const failedResult: ProposalResult = {
  stage: "transitions",
  proposal: { summary: "", ops: [] },
  preview: { errors: [], diagnostics: [] },
  status: "failed",
  issues: ["transitions.0.gate: gate references undeclared quality 'ghost'"],
  questions: [],
  audit: { prompt: "", rawResponse: "", finish: "stop" },
};

// Provisioning steps ride the same card but are excluded from Accept all: they write to the user's
// install and each one is reviewed on its own (plan 06).
const provisioningResult: ProposalResult = {
  stage: "provisioning",
  proposal: parseProposal(JSON.stringify({
    summary: "This story needs one card and a lorebook.",
    ops: [
      { kind: "createCharacterCard", name: "Arin", description: "A guide who knows the ruins." },
      { kind: "createStoryLorebook", name: "Sun Ruins Lore" },
    ],
  })).proposal,
  preview: { errors: [], diagnostics: [] },
  status: "ok",
  issues: [],
  questions: [],
  audit: { prompt: "", rawResponse: "", finish: "stop" },
};

const meta: Meta<typeof ProposalReview> = {
  title: "Studio/ProposalReview",
  component: ProposalReview,
  args: { onAccept: fn(), onAcceptAll: fn(), onDismiss: fn(), onProvision: fn() },
};

export default meta;

type Story = StoryObj<typeof ProposalReview>;

export const Accepting: Story = {
  args: { result: okResult, acceptedIndices: new Set<number>() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Add quality "morale"/)).toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "Accept" })[0]);
    await expect(args.onAccept).toHaveBeenCalledWith(0);
    await userEvent.click(canvas.getByRole("button", { name: "Accept all" }));
    await expect(args.onAcceptAll).toHaveBeenCalled();
  },
};

// v2.3 plan 09 fixture: a real model's stage can propose a great many changes at once, and the card
// that has to stay legible is the one with thirty rows in it.
export const ManyOps: Story = {
  args: {
    result: {
      ...okResult,
      proposal: parseProposal(JSON.stringify({
        summary: "Thirty changes at once.",
        ops: Array.from({ length: 30 }, (_, index) => ({ kind: "addQuality", quality: { key: `beat_${index}`, type: "int", source: "extractor", rubric: `How far has beat ${index} moved?` } })),
      })).proposal,
    },
    acceptedIndices: new Set<number>(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button", { name: "Accept" })).toHaveLength(30);
    await expect(canvas.getByRole("button", { name: "Accept all" })).toBeEnabled();
    await expect(canvas.getByText(/Add quality "beat_29"/)).toBeInTheDocument();
  },
};

// The consequence is what an author decides on, so it comes before the schema's own words.
export const WarningStatesTheConsequenceFirst: Story = {
  args: { result: okResult, acceptedIndices: new Set<number>() },
  play: async ({ canvasElement }) => {
    const consequence = canvasElement.querySelector('[data-so="diagnostic-consequence"]') as HTMLElement;
    await expect(consequence).toHaveTextContent("Progress can never reach this threshold, so the story cannot converge here.");
    const line = consequence.parentElement?.textContent ?? "";
    await expect(line).toContain("cache threshold 2 exceeds available progress 0");
    await expect(line.indexOf("Progress can never reach")).toBeLessThan(line.indexOf("cache threshold 2"));
  },
};

export const Failed: Story = {
  args: { result: failedResult, acceptedIndices: new Set<number>() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Invalid proposal")).toBeInTheDocument();
    await expect(canvas.getByText(/undeclared quality 'ghost'/)).toBeInTheDocument();
  },
};

export const ProvisioningIsReviewedPerStep: Story = {
  args: {
    result: provisioningResult,
    acceptedIndices: new Set<number>(),
    environment: { characterNames: ["Ponticius"], lorebookNames: [], groupNames: [], storyLorebooks: [], ownedLorebooks: [], grantedLorebooks: [] },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Nothing to bulk-accept: both ops are provisioning.
    await expect(canvas.getByRole("button", { name: "Accept all" })).toBeDisabled();
    const applyButtons = canvas.getAllByRole("button", { name: "Create it" });
    await expect(applyButtons).toHaveLength(2);
    await userEvent.click(applyButtons[0]);
    await expect(args.onProvision).toHaveBeenCalled();
  },
};

export const ProvisioningRefusesAnExistingAsset: Story = {
  args: {
    result: provisioningResult,
    acceptedIndices: new Set<number>(),
    environment: { characterNames: ["Arin"], lorebookNames: [], groupNames: [], storyLorebooks: [], ownedLorebooks: [], grantedLorebooks: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/never edits yours/)).toBeInTheDocument();
    await expect(canvas.getAllByRole("button", { name: "Create it" })[0]).toBeDisabled();
  },
};
