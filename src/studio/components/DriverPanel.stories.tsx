import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import type { DriverContext } from "@copilot/index";
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
});

const meta: Meta<typeof DriverPanel> = {
  title: "Studio/DriverPanel",
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
