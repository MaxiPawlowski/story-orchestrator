import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import type { RuntimeSnapshot } from "@runtime/types";
import { HudStrip } from "./HudStrip";

const baseSnapshot = (overrides: Record<string, unknown> = {}): RuntimeSnapshot =>
  ({
    ready: true,
    activeCheckpointName: "The Ruined Gate",
    tension: { level: "high", smoothed: 0.72, expected: 0.6, hint: null },
    ui: { authorView: false, announceTransitions: true, hudEnabled: true },
    pendingDeltas: [],
    pipeline: { state: "idle", text: "Following along.", detail: null, needsSetup: false },
    ...overrides,
  }) as unknown as RuntimeSnapshot;

const meta: Meta<typeof HudStrip> = {
  title: "Drawer/HudStrip",
  component: HudStrip,
  args: { onOpenDrawer: fn(), onOpenSettings: fn() },
};

export default meta;

type Story = StoryObj<typeof HudStrip>;

export const Default: Story = {
  args: { snapshot: baseSnapshot() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/◈ The Ruined Gate/)).toBeInTheDocument();
    await expect(canvas.getByText(/tension high/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onOpenDrawer).toHaveBeenCalledTimes(1);
  },
};

export const CatchingUp: Story = {
  args: { snapshot: baseSnapshot({ pipeline: { state: "stalled-rechecking", text: "Catching up — re-checking recent scenes.", detail: null, needsSetup: false } }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("catching up…"));
    await expect(args.onOpenDrawer).toHaveBeenCalled();
    await expect(args.onOpenSettings).not.toHaveBeenCalled();
  },
};

export const NeedsSetup: Story = {
  args: { snapshot: baseSnapshot({ pipeline: {
    state: "not-configured",
    text: "Nothing is following the story yet — choose a memory model in the extension settings.",
    detail: null,
    needsSetup: true,
  } }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("needs setup"));
    await expect(args.onOpenSettings).toHaveBeenCalledTimes(1);
  },
};

export const PendingDelta: Story = {
  args: { snapshot: baseSnapshot({ pendingDeltas: [{ quality: "luke_decision", value: "accepted", source: "extractor" }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("1 update next turn")).toBeInTheDocument();
  },
};

export const HiddenWhenDisabled: Story = {
  args: { snapshot: baseSnapshot({ ui: { authorView: false, announceTransitions: true, hudEnabled: false } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

export const BranchChip: Story = {
  args: { snapshot: baseSnapshot({ ready: false, chatIdentity: { kind: "branch", parentChat: "parent-chat", checkpointName: "The Ruined Gate" } }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("branch — continue?"));
    await expect(args.onOpenDrawer).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByText(/◈/)).toBeNull();
  },
};

export const NoBranchChipForAForeignBlob: Story = {
  args: { snapshot: baseSnapshot({ ready: false, chatIdentity: { kind: "foreign", stampedFor: "another-chat" } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

export const HiddenWhenNoStory: Story = {
  args: { snapshot: baseSnapshot({ ready: false }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};
