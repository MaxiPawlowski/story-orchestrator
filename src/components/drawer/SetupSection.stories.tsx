import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { setupFindings } from "@runtime/repair";
import { createSaveHealth } from "@runtime/saveHealth";
import type { RuntimeSnapshot } from "@runtime/types";
import SetupSection, { SETUP_COPY } from "./SetupSection";

const snapshot = (overrides: Record<string, unknown> = {}): RuntimeSnapshot => ({
  storyId: "quest",
  extraction: { settings: { enabled: true, profileId: "p1" } },
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: createSaveHealth(),
  ui: { authorView: false },
  ...overrides,
}) as unknown as RuntimeSnapshot;

const many = {
  extraction: { settings: { enabled: true, profileId: null } },
  requirements: { ready: false, missingPersonas: [], missingMembers: ["Belle"], absentMembers: [], missingLorebooks: [] },
  secretLeaks: ["Summarize"],
  thinkingSilent: true,
};

const meta: Meta<typeof SetupSection> = {
  title: "Drawer/SetupSection",
  component: SetupSection,
  args: { authorView: false, onShowMe: fn(), onFix: fn(), onDismiss: fn() },
};

export default meta;

type Story = StoryObj<typeof SetupSection>;

export const NothingFound: Story = {
  args: { findings: setupFindings(snapshot()) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-setup")).toBeNull();
  },
};

export const OneBlockingFinding: Story = {
  args: { findings: setupFindings(snapshot({ extraction: { settings: { enabled: true, profileId: null } } })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvasElement.querySelector('[data-so="setup-row"][data-check="memory-model"]');
    await expect(row?.getAttribute("data-severity")).toBe("blocks");
    await expect(row?.querySelector('[data-so="setup-dismiss"]')).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: SETUP_COPY.showMe }));
    await expect(args.onShowMe).toHaveBeenCalledWith({ kind: "setting", id: "so-extraction-profile" });
  },
};

export const OneDegradingFindingCanBeDismissed: Story = {
  args: { findings: setupFindings(snapshot({ thinkingSilent: true })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(SETUP_COPY.degrades)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: SETUP_COPY.dismiss }));
    await expect(args.onDismiss).toHaveBeenCalledWith("model-not-thinking", true);
  },
};

export const ManyFindingsWithAOneClickFix: Story = {
  args: { findings: setupFindings(snapshot(many)) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const rows = [...canvasElement.querySelectorAll('[data-so="setup-row"]')].map((row) => row.getAttribute("data-check"));
    await expect(rows).toEqual(["memory-model", "cast-unbound", "transcript-copiers", "model-not-thinking"]);
    await userEvent.click(canvas.getByRole("button", { name: "Add Belle back to the group" }));
    await expect(args.onFix).toHaveBeenCalledWith({ kind: "add-members", members: ["Belle"], label: "Add Belle back to the group" });
    await expect(canvasElement.querySelectorAll('[data-so="setup-detail"]')).toHaveLength(0);
  },
};

export const InfoFinding: Story = {
  args: {
    findings: {
      blocks: [], degrades: [], dismissed: [],
      info: [{
        check: "whats-new", area: "lore", severity: "info", consequence: "Stories now play in group chats.", detail: "Stories now play in group chats.",
        targetId: null, target: null, provisionable: false, player: "Stories now play in group chats.", action: null, opensGroup: false, dismissable: true,
      }],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(SETUP_COPY.info)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: SETUP_COPY.dismiss })).toBeInTheDocument();
  },
};

export const AuthorViewAddsDetail: Story = {
  args: { authorView: true, findings: setupFindings(snapshot({ ...many, ui: { authorView: true } })) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-so="setup-detail"]').length).toBeGreaterThan(0);
  },
};

export const DismissedCanComeBack: Story = {
  args: { findings: setupFindings(snapshot({ thinkingSilent: true, dismissedChecks: ["model-not-thinking"] })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="setup-row"]')).toBeNull();
    await userEvent.click(canvas.getByText(SETUP_COPY.dismissed(1)));
    await userEvent.click(canvas.getByRole("button", { name: SETUP_COPY.restore }));
    await expect(args.onDismiss).toHaveBeenCalledWith("model-not-thinking", false);
  },
};

export const BeforeYouStartListsBlockersFirst: Story = {
  args: { beforeStart: true, findings: setupFindings(snapshot(many)) },
  play: async ({ canvasElement }) => {
    const before = canvasElement.querySelector("#so-before-you-start");
    await expect(before).not.toBeNull();
    await expect([...(before?.querySelectorAll('[data-so="setup-row"]') ?? [])].map((row) => row.getAttribute("data-severity"))).toEqual(["blocks", "blocks"]);
  },
};

export const BeforeYouStartWithNothingBlocking: Story = {
  args: { beforeStart: true, findings: setupFindings(snapshot({ thinkingSilent: true })) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-before-you-start")).toBeNull();
  },
};

export const PrivacyLegSecretHeld: Story = {
  args: { findings: setupFindings(snapshot({ secretLeaks: ["Summarize"], secretsHeld: true })) },
  play: async ({ canvasElement }) => {
    const unheld = setupFindings(snapshot({ secretLeaks: ["Summarize"], secretsHeld: false }));
    const text = canvasElement.querySelector("#so-setup")?.textContent ?? "";
    await expect(text).toContain(unheld.degrades[0]?.consequence ?? "missing");
    await expect(text).not.toMatch(/held|hiding|unaware/i);
  },
};

export const Phone: Story = { args: { findings: setupFindings(snapshot(many)) }, parameters: { testViewport: { width: 390, height: 844 } } };
export const Tablet: Story = { args: { findings: setupFindings(snapshot(many)) }, parameters: { testViewport: { width: 768, height: 1024 } } };
export const Desktop: Story = { args: { findings: setupFindings(snapshot(many)) }, parameters: { testViewport: { width: 1440, height: 900 } } };
