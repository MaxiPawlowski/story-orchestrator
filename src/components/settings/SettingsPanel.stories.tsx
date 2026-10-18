import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import { createSaveHealth } from "@runtime/saveHealth";
import { getGlobalSettings } from "@runtime/settingsStore";
import type { RuntimeSnapshot } from "@runtime/types";
import SettingsPanel, { type SettingsHost } from "./SettingsPanel";

const snapshot = (authorView: boolean): RuntimeSnapshot =>
  ({
    ready: true,
    status: "Hydrated The Quest for the Sun Ruins",
    storyId: "sun-ruins",
    storyIdentity: { id: "sun-ruins", pinned: true, drifted: false },
    library: [{ id: "sun-ruins", title: "The Quest for the Sun Ruins" }],
    validationErrors: [],
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    saveHealth: createSaveHealth(),
    copilot: { enabled: true },
    extraction: { settings: { enabled: true, profileId: "artemis", cadence: 3, stabilityLag: 0 } },
    memory: { settings: { epistemicLedgerCapable: true } },
    roleRoutes: [],
    modelCallRing: [],
    wiGating: null,
    pacing: { alpha: 0.3, shapeOverride: null, hintEnabled: true },
    stagecraft: { settings: { curatorEnabled: true, acceptMode: "review", wardenEnabled: false, wardenAcceptMode: "review" } },
    stagecraftScope: ["Xentar Checkpoints"],
    ui: { authorView, announceTransitions: true, hudEnabled: true, inline: { level: 1, categories: {}, window: 20 } },
    inline: { level: 1, requested: 1, window: 20, categories: {}, newestMessageId: 0, byMessage: {} },
  }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager =>
  ({
    getJudge: () => null,
    getSnapshot: () => snapshot(false),
    getStory: () => null,
    getEngineState: () => null,
    getGlobalSettings,
    getEffectiveSettings: getGlobalSettings,
    ownsImageChat: () => false,
    subscribe: () => () => {},
    onBoundary: () => () => {},
    onSceneBreakConfirmed: () => () => {},
    onRollback: () => () => {},
    onEpochChanged: () => () => {},
    selectStory: fn(async () => undefined),
    importStory: fn(async () => true),
    restartStory: fn(async () => undefined),
    removeStory: fn(async () => true),
    setCopilotSettings: fn(),
    setExtractionSettings: fn(),
    setMemorySettings: fn(),
    setUiSettings: fn(),
    setInlineSettings: fn(),
    setStagecraftSettings: fn(),
    setTalkChainSettings: fn(),
    setPacingSettings: fn(),
    setScanMemory: fn(),
    carry: { shelf: fn(async () => []) },
  }) as unknown as RuntimeManager;

const host = (): SettingsHost => ({
  memoryModelLimit: () => null,
  recheckMemoryModel: fn(),
  openWizard: fn(),
  openStudio: fn(),
  openWizardForRequirements: fn(),
  revealSetting: fn(),
  openStory: fn(),
  openAuthorView: fn(),
  showFeature: fn(),
  openPanel: fn(),
});

const meta: Meta<typeof SettingsPanel> = {
  title: "Settings/SettingsPanel",
  component: SettingsPanel,
};

export default meta;

type Story = StoryObj<typeof SettingsPanel>;

const sectionIds = (root: HTMLElement) => [...root.querySelectorAll<HTMLDetailsElement>('[data-so="settings-area"]')].map((section) => section.id);

export const LibraryHoldsTheStoryAndItsEntryPoints: Story = {
  args: { workspaceSection: "library", snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Story for this chat")).toHaveValue("sun-ruins");
    await expect(sectionIds(canvasElement)).toEqual(["so-area-play"]);
    await expect((canvasElement.querySelector("#so-area-play") as HTMLDetailsElement).open).toBe(true);
    await expect(canvasElement.querySelector("#so-area-play > summary")?.textContent).toContain("Which story this chat plays");
    await expect(canvasElement.querySelector("#so-entry-points")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-copilot-enabled")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Open story and chat preferences" }));
    await expect(args.host.openStory).toHaveBeenCalledTimes(1);
  },
};

export const ConnectionsHoldTheInstallServices: Story = {
  args: { workspaceSection: "connections", snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Memory model")).toBeInTheDocument();
    await expect(sectionIds(canvasElement)).toEqual(["so-area-memory", "so-area-world", "so-area-images", "so-area-judge", "so-area-setup"]);
    await expect(canvasElement.querySelector("#so-area-memory #so-extraction-profile")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-area-images #so-image-settings")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-curator-enabled")).toBeNull();
    await expect(canvasElement.querySelector("#so-warden-enabled")).toBeNull();
    await expect(canvasElement.querySelector("#so-pacing-hint")).toBeNull();
    await expect(canvasElement.querySelector("[data-so='engine-status']")).toBeNull();
  },
};

export const AuthorViewShowsTheEngineStatus: Story = {
  args: { workspaceSection: "connections", snapshot: snapshot(true), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("[data-so='engine-status']")).toHaveTextContent("Hydrated The Quest for the Sun Ruins"));
  },
};

export const HelpOpensTheFloatingPanel: Story = {
  args: { workspaceSection: "help", snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(sectionIds(canvasElement)).toEqual(["so-area-authoring", "so-area-setup"]);
    await expect(canvasElement.querySelector("#so-area-authoring #so-copilot-enabled")).not.toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Help and Ask" }));
    await expect(args.host.openPanel).toHaveBeenCalledWith("help");
  },
};

export const JudgeGroupArrivesFromItsLazyChunk: Story = {
  args: { workspaceSection: "connections", snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("#so-judge")).not.toBeNull());
    await expect(canvasElement.querySelector("#so-judge-status")).not.toBeNull();
    await expect(canvasElement.querySelector("[data-so='lazy-failed']")).toBeNull();
  },
};

export const GuideButtonOpensTheAreaPage: Story = {
  args: { workspaceSection: "connections", snapshot: snapshot(false), manager: fakeManager(), host: { ...host(), openGuide: fn() } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Read the guide: Memory" }));
    await expect(args.host.openGuide).toHaveBeenCalledWith("setup/memory-model.md");
    await expect((canvasElement.querySelector("#so-area-memory") as HTMLDetailsElement).open).toBe(false);
  },
};

export const AdvancedFoldHoldsTheChatNote: Story = {
  args: { workspaceSection: "library", snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    const fold = canvasElement.querySelector("#so-area-play-advanced") as HTMLDetailsElement;
    await expect(fold.open).toBe(false);
    await expect(fold.querySelector("#so-announce-transitions")).not.toBeNull();
    await userEvent.click(within(fold).getByText("Advanced"));
    await expect(fold.open).toBe(true);
  },
};

export const OpeningASectionIsRemembered: Story = {
  args: { workspaceSection: "connections", snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    const memory = canvasElement.querySelector("#so-area-memory") as HTMLDetailsElement;
    await userEvent.click(memory.querySelector("summary") as HTMLElement);
    await waitFor(() => expect(getGlobalSettings().help.openSections).toEqual(["play", "memory"]));
    await userEvent.click(memory.querySelector("summary") as HTMLElement);
    await waitFor(() => expect(getGlobalSettings().help.openSections).toEqual(["play"]));
  },
};
