import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import type { RuntimeSnapshot } from "@runtime/types";
import { HudStrip } from "./HudStrip";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const baseSnapshot = (overrides: Record<string, unknown> = {}): RuntimeSnapshot =>
  ({
    ready: true,
    activeCheckpointName: "The Ruined Gate",
    narrative: { title: "Quest", sections: [{ id: "now", label: "Where you are", lines: ["The Ruined Gate"] }], text: "" },
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
  args: { snapshot: baseSnapshot({
    storyId: "quest",
    extraction: { settings: { enabled: true, profileId: null } },
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    pipeline: { state: "not-configured", text: "Nothing is following the story yet — choose a memory model in the extension settings.", detail: null, needsSetup: true },
  }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-hud-pipeline")).toBeNull();
    const chip = canvas.getByText("fix setup (1)");
    await expect(chip.getAttribute("data-blocks")).toBe("1");
    await expect(chip.getAttribute("title")).toMatch(/1 thing stops the story/);
    await userEvent.click(chip);
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

export const OpeningReadingsNotCounted: Story = {
  args: { snapshot: baseSnapshot({ pendingDeltas: [
    { quality: "location", value: "aegis_guild_hall", source: "extractor", opening: true },
    { quality: "party_injuries", value: 0, source: "extractor", opening: true },
    { quality: "party_name", value: "Grey Pennants", source: "extractor" },
  ] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("1 update next turn")).toBeInTheDocument();
  },
};

export const NoPendingChipBeforeTheFirstTurn: Story = {
  args: { snapshot: baseSnapshot({ pendingDeltas: [{ quality: "location", value: "aegis_guild_hall", source: "extractor", opening: true }] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/next turn/)).toBeNull();
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
    await userEvent.click(canvas.getByText("You went back: continue from here?"));
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

const playing = {
  storyId: "quest",
  extraction: { settings: { enabled: true, profileId: "p1" } },
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: { lastAppliedBoundary: 3, pendingBoundary: null, lastOutcome: "applied", consecutiveFailures: 0, lastReason: null, lastFailureAt: null },
};

export const SetupAlertForAPlayer: Story = {
  args: { snapshot: baseSnapshot({ ...playing, thinkingSilent: true }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const chip = canvas.getByText("check setup (1)");
    await expect(chip.getAttribute("data-degrades")).toBe("1");
    await expect(chip.getAttribute("title")).toMatch(/the model is not thinking/);
    await expect(chip.getAttribute("title")).not.toMatch(/harvest|Inner voice/);
    await userEvent.click(chip);
    await expect(args.onOpenSettings).toHaveBeenCalledTimes(1);
  },
};

export const PipelineChipWinsOverSetupAlert: Story = {
  args: { snapshot: baseSnapshot({ ...playing, secretLeaks: ["Summarize"], pipeline: { state: "catching-up", text: "Catching up after your edit…", detail: null, needsSetup: false } }) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-hud-setup")).toBeNull();
    await userEvent.click(canvas.getByText("catching up after your edit"));
    await expect(args.onOpenDrawer).toHaveBeenCalledTimes(1);
  },
};

export const NoSetupAlertWhenNothingIsMissing: Story = {
  args: { snapshot: baseSnapshot(playing) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-hud-setup")).toBeNull();
  },
};

export const ManyFindingsCountBySeverity: Story = {
  args: { snapshot: baseSnapshot({
    ...playing, thinkingSilent: true, secretLeaks: ["Summarize"],
    requirements: { ...playing.requirements, ready: false, missingMembers: ["Belle"], absentMembers: [] },
  }) },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector("#so-hud-setup");
    await expect(chip?.textContent).toBe("fix setup (3)");
    await expect(chip?.getAttribute("data-blocks")).toBe("1");
    await expect(chip?.getAttribute("data-degrades")).toBe("2");
  },
};

export const DismissedFindingLeavesTheChip: Story = {
  args: { snapshot: baseSnapshot({ ...playing, thinkingSilent: true, dismissedChecks: ["model-not-thinking"] }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-hud-setup")).toBeNull();
  },
};

export const HiddenWhenNoStory: Story = {
  args: { snapshot: baseSnapshot({ ready: false }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

const DUPLICATE_IDS = { config: { rules: [{ id: "duplicate-id", enabled: false }, { id: "duplicate-id-active", enabled: false }] } };

export const SecretLeakAlertIsTheSameWithAndWithoutAHeldSecret: Story = {
  parameters: { a11y: DUPLICATE_IDS },
  render: (args) => (
    <>
      <div data-arm="held"><HudStrip {...args} snapshot={baseSnapshot({ ...playing, secretLeaks: ["Summarize"], secretsHeld: true })} /></div>
      <div data-arm="unheld"><HudStrip {...args} snapshot={baseSnapshot({ ...playing, secretLeaks: ["Summarize"], secretsHeld: false })} /></div>
    </>
  ),
  play: async ({ canvasElement }) => {
    const arm = (name: string) => canvasElement.querySelector(`[data-arm="${name}"] #so-hud`);
    const chip = (name: string) => arm(name)?.querySelector("#so-hud-setup");
    await expect(chip("held")).not.toBeNull();
    await expect(chip("unheld")).not.toBeNull();
    await expect(arm("held")?.textContent).toBe(arm("unheld")?.textContent);
    await expect(chip("held")?.getAttribute("title")).toBe(chip("unheld")?.getAttribute("title"));
    await expect(chip("held")?.getAttribute("title")).not.toMatch(/held|hiding|unaware/i);
  },
};

const hudButton = (canvasElement: HTMLElement) => canvasElement.querySelector(".so-hud-main");
const crowded = { args: { snapshot: baseSnapshot({ ...playing, thinkingSilent: true, pendingDeltas: [{ quality: "luke_decision", value: "accepted", source: "extractor" }] }) } };

export const Phone: Story = { ...crowded, ...fitsAt(VIEWPORTS.phone, hudButton) };
export const Tablet: Story = { ...crowded, ...fitsAt(VIEWPORTS.tablet, hudButton) };
export const Wide: Story = { ...crowded, ...fitsAt(VIEWPORTS.wide, hudButton) };
