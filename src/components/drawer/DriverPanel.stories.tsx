import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn, waitFor } from "@storybook/test";
import type { DriverContext } from "@copilot/index";
import { DEFAULT_AGENCY } from "@engine/index";
import DriverPanel, { type DriverController } from "./DriverPanel";

const context: DriverContext = {
  title: "The Vault Job",
  activeCheckpointId: "approach",
  activeObjective: "Reach the vault door.",
  unmetGates: ["has_key == true → vault"],
  upcomingAnchors: [{ id: "vault", name: "Vault", progress: 0, threshold: 1 }],
  blackboard: { has_key: false },
  canon: "",
  recentChat: "",
};

const checkpoints = [
  { id: "approach", name: "Approach", active: true },
  { id: "vault", name: "Vault", active: false },
];

const makeController = (): DriverController => ({
  suggest: async () => [{ title: "Confront the guard", rationale: "The alarm is silent, so the crew can press the advantage." }],
  nudge: fn(),
  clearNudge: fn(),
  probe: fn(async () => {}),
  advance: fn(async () => {}),
  report: async () => "The crew holds the key and is closing on the vault.",
  stepBack: fn(async () => ({ ok: true, detail: "Approach" })),
  resetQuality: fn(async () => {}),
});

const meta: Meta<typeof DriverPanel> = {
  title: "Drawer/DriverPanel",
  component: DriverPanel,
  args: { context, checkpoints, activeNudge: null },
};

export default meta;

type Story = StoryObj<typeof DriverPanel>;

export const SuggestAndNudge: Story = {
  args: { controller: makeController() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Suggest" }));
    await expect(await canvas.findByText("Confront the guard")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Nudge with this" }));
    await expect(args.controller.nudge).toHaveBeenCalled();
  },
};

export const AdvanceRequiresConfirm: Story = {
  args: { controller: makeController() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("Advance target"), "vault");
    await userEvent.click(canvas.getByRole("button", { name: "Advance" }));
    await expect(canvas.getByRole("button", { name: "Confirm advance" })).toBeInTheDocument();
    await expect(args.controller.advance).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Confirm advance" }));
    await expect(args.controller.advance).toHaveBeenCalledWith("vault");
    await expect(await canvas.findByRole("status")).toHaveTextContent("Advanced to vault.");
    await expect(canvas.getByRole("button", { name: "Advance" })).toBeEnabled();
    await waitFor(() => expect(canvasElement.getAnimations({ subtree: true })).toHaveLength(0));
  },
};

export const ActiveNudge: Story = {
  args: { controller: makeController(), activeNudge: "Escalate the standoff before the guard returns." },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Active nudge")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Clear" }));
    await expect(args.controller.clearNudge).toHaveBeenCalled();
  },
};

export const NoStory: Story = {
  args: { controller: makeController(), context: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Driver unavailable")).toBeInTheDocument();
  },
};

// v2.3 plan 07 (C4): the policy in effect, shown where the author is standing. A player never sees
// this panel, so the policy reads as plain prose here rather than through a gate.
export const AgencyPolicyInEffect: Story = {
  args: { controller: makeController(), agency: { ...DEFAULT_AGENCY, objective_kind: "player_action", alternate: "vault" } },
  play: async ({ canvasElement }) => {
    const policy = canvasElement.querySelector('[data-so="agency-policy"]');
    await expect(policy?.textContent).toContain("Needs the player's own act");
    await expect(policy?.textContent).toContain("never narrates the player");
    await expect(policy?.textContent).toContain("alternate: vault");
  },
};

export const AgencyPolicyAuthorOptedOut: Story = {
  args: { controller: makeController(), agency: { protect_player_choice: false, never_narrate_player_action: false, objective_kind: "world_pressure" } },
  play: async ({ canvasElement }) => {
    const policy = canvasElement.querySelector('[data-so="agency-policy"]');
    await expect(policy?.textContent).toContain("World pressure");
    await expect(policy?.textContent).toContain("choices not protected");
    await expect(policy?.textContent).not.toContain("never narrates the player");
  },
};

export const StepBackRecovery: Story = {
  args: {
    controller: makeController(),
    recovery: { from: "start", to: "stealth", keys: ["route"], checkpointName: "Stealth" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const panel = canvasElement.querySelector('[data-so="driver-recovery"]');
    await expect(panel?.textContent).toContain("start → Stealth");
    await userEvent.click(canvas.getByRole("button", { name: "Step back" }));
    await expect(canvas.getByRole("button", { name: "Confirm step back" })).toBeInTheDocument();
    await expect(args.controller.stepBack).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Confirm step back" }));
    await expect(args.controller.stepBack).toHaveBeenCalled();
  },
};
