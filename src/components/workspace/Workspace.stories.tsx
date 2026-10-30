import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import Workspace from "./Workspace";
import { resolveFeatures } from "@runtime/featureResolve";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import { buildNarrativeStatus } from "@runtime/narrative";
import { derivePipelineStatus } from "@runtime/pipeline";
import { createSaveHealth } from "@runtime/saveHealth";
import type { ExtractionRuntimeState, RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { SettingsHost } from "@components/settings/SettingsPanel";
import type { DrawerTabsProps } from "@components/drawer/DrawerTabs";
import { PLAY_COPY } from "@features/playCopy";
import { SETUP_COPY } from "@components/drawer/SetupSection";
import { VIEWPORTS } from "../../../.storybook/fit";

const global = defaultGlobalSettings();
const snapshot = {
  ready: true, storyTitle: "Test story", features: resolveFeatures(global, null), featureOverrides: {},
  stagecraftScope: [], extraction: { settings: global.extraction }, memory: { settings: global.memory },
  stagecraft: { settings: global.stagecraft }, ui: { authorView: false },
} as unknown as RuntimeSnapshot;

const extraction: ExtractionRuntimeState = {
  settings: { ...global.extraction, enabled: true, profileId: "p1" }, audits: [], reconciliationEvents: [], lastReadBoundary: 4,
  scheduler: { queueDepth: 0, inFlight: false, lastError: null }, judgedReads: [],
} as unknown as ExtractionRuntimeState;
const pipeline = derivePipelineStatus(extraction, undefined, null);

const playSnapshot = {
  ...snapshot, storyId: "quest", boundary: 4, extraction, pipeline, saveHealth: createSaveHealth(),
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  libraryLost: { stories: ["Old tale"], sessions: [], changed: [] }, thinkingSilent: true,
  narrative: buildNarrativeStatus({
    storyTitle: "Test story", checkpointName: "The Ruined Gate", objective: "Breach the sanctum.", lastTransition: { fromName: "Camp", toName: "The Ruined Gate" },
    openThreads: ["Who left the gate open"], canon: "The party crossed the dunes and reached the gate at dusk.", tensionLevel: "tense", pendingCount: 0, pipeline,
    sceneLocation: null, consequences: null,
  }),
  memory: { settings: global.memory, entries: [{ id: "m1", text: "The sun-key opens the inner sanctum.", tier: "facts", status: "live" }] },
  game: { journal: [{ id: "q1", title: "The ferry", status: "active", steps: [] }], milestones: [], codex: null, statSheet: { id: "sheet", rows: [] }, widgets: [{ id: "road", title: "The road" }] },
  presence: { shown: { journal: true, statSheet: true, widgets: true, suggestions: true }, continueRows: [] },
} as unknown as RuntimeSnapshot;

const meta: Meta<typeof Workspace> = {
  title: "Workspace/Workspace", component: Workspace,
  args: { intent: { context: "story", page: "features" }, snapshot,
    manager: { setFeatureOverride: fn(() => true) } as unknown as RuntimeManager,
    settingsHost: {} as SettingsHost, drawerProps: {} as DrawerTabsProps, onClose: fn() },
};
export default meta;
type Story = StoryObj<typeof Workspace>;
export const Desktop: Story = {};
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };

const lineCount = (element: Element) => {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.bottom))).size;
};

const playPage = (viewport: { width: number; height: number }, maxLines: number): Story => ({
  args: {
    intent: { context: "story", page: "play" }, snapshot: playSnapshot,
    manager: { setCheckDismissed: fn(), restartStory: fn(), flagMoment: fn() } as unknown as RuntimeManager,
    settingsHost: { openPanel: fn(), openStory: fn() } as unknown as SettingsHost,
    drawerProps: { onShowMe: fn(), onFix: fn() } as unknown as DrawerTabsProps,
  },
  parameters: { testViewport: viewport, a11y: { element: "#so-workspace-modal" } },
  play: async ({ canvasElement, args }) => {
    const doc = canvasElement.ownerDocument;
    const page = within(doc.body);
    await page.findByRole("dialog", { name: "Test story" });
    await expect(await page.findByRole("heading", { name: "The Ruined Gate", level: 2 })).toBeVisible();
    const toggle = await page.findByRole("button", { name: new RegExp(SETUP_COPY.count(1)) });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(doc.querySelector('[data-so="setup-row"][data-check="library-lost-to-tab"]')).toBeNull();
    await userEvent.click(toggle);
    await expect(lineCount(await page.findByRole("button", { name: SETUP_COPY.dismiss }))).toBe(1);
    const tabs = within(await page.findByRole("tablist", { name: PLAY_COPY.tabsLabel }));
    for (const name of [PLAY_COPY.now, "Journal", "Stats", "The road", PLAY_COPY.memory]) await expect(tabs.getByRole("tab", { name })).toBeVisible();
    await expect(doc.querySelector("#so-open-memory")?.getAttribute("role")).toBe("tab");
    await expect(doc.querySelector("#so-chat-side")).toBeNull();
    const ideas = await page.findByRole("button", { name: "What could I do?" });
    await expect(ideas.closest("details")).toBeNull();
    await expect(lineCount(await page.findByRole("button", { name: PLAY_COPY.restart }))).toBeLessThanOrEqual(maxLines);
    await userEvent.click(tabs.getByRole("tab", { name: "Journal" }));
    await expect(await page.findByRole("button", { name: PLAY_COPY.popOut("Journal") })).toHaveAttribute("id", "so-open-journal");
    await userEvent.click(page.getByRole("button", { name: PLAY_COPY.restart }));
    const confirm = await page.findByRole("dialog", { name: PLAY_COPY.restartTitle });
    await userEvent.click(within(confirm).getAllByRole("button", { name: PLAY_COPY.restartKeep })[1]);
    await expect(args.manager.restartStory).not.toHaveBeenCalled();
    const root = doc.documentElement;
    const modal = doc.querySelector("#so-workspace-content") as HTMLElement;
    await expect(modal.scrollWidth).toBeLessThanOrEqual(modal.clientWidth);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
});

export const PlayDesktop: Story = playPage(VIEWPORTS.wide, 1);

const soloSnapshot = { ...snapshot, ready: false, storyTitle: null, noChat: null, boundary: 0, copilot: { enabled: true },
  noGroup: { notice: "Stories play in group chats.", storyId: null, storyTitle: null } } as unknown as RuntimeSnapshot;
export const PlayInAOneOnOneChat: Story = {
  args: { intent: { context: "story", page: "play" }, snapshot: soloSnapshot,
    settingsHost: { makeGroup: fn(async () => ({ ok: true as const, group: "g", message: "made" })) } as unknown as SettingsHost,
    drawerProps: { onShowMe: fn(), onFix: fn() } as unknown as DrawerTabsProps },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("heading", { name: "Stories play in group chats" })).toBeInTheDocument();
    await expect(page.queryByRole("heading", { name: "Playing this story" })).toBeNull();
    const card = await page.findByText(/This is a one-on-one chat/);
    await expect(card.closest("#so-play-make-group")).not.toBeNull();
    await expect(page.queryByRole("button", { name: "Make a group for this story" })).toBeNull();
    await expect(await page.findByRole("button", { name: "Open library" })).toBeInTheDocument();
  },
};

export const PlayWithNoStory: Story = {
  args: { intent: { context: "story", page: "play" }, snapshot: { ...soloSnapshot, noGroup: null } as unknown as RuntimeSnapshot,
    drawerProps: { onShowMe: fn(), onFix: fn() } as unknown as DrawerTabsProps },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("heading", { name: "No story in this chat" })).toBeInTheDocument();
    await expect(await page.findByText("Choose a story for this chat.")).toBeInTheDocument();
  },
};
export const PlayPhone: Story = playPage(VIEWPORTS.phone, 2);
