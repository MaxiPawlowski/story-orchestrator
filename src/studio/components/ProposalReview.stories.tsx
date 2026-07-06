import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import { parseProposal, type ProposalResult } from "@copilot/index";
import ProposalReview from "./ProposalReview";

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
  preview: { errors: [], diagnostics: [{ code: "threshold-unsatisfiable", severity: "warning", path: "checkpoints.2", message: "cache threshold 2 exceeds available progress 0" }] },
  status: "ok",
  issues: [],
  audit: { prompt: "", rawResponse: "" },
};

const failedResult: ProposalResult = {
  stage: "transitions",
  proposal: { summary: "", ops: [] },
  preview: { errors: [], diagnostics: [] },
  status: "failed",
  issues: ["transitions.0.gate: gate references undeclared quality 'ghost'"],
  audit: { prompt: "", rawResponse: "" },
};

const meta: Meta<typeof ProposalReview> = {
  title: "Studio/ProposalReview",
  component: ProposalReview,
  args: { onAccept: fn(), onAcceptAll: fn(), onDismiss: fn() },
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

export const Failed: Story = {
  args: { result: failedResult, acceptedIndices: new Set<number>() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Invalid proposal")).toBeInTheDocument();
    await expect(canvas.getByText(/undeclared quality 'ghost'/)).toBeInTheDocument();
  },
};
