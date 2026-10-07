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
  }) as unknown as RuntimeManager;

const host = (): SettingsHost => ({
  memoryModelLimit: () => null,
  recheckMemoryModel: fn(),
  openWizard: fn(),
  openStudio: fn(),
  openWizardForRequirements: fn(),
  revealSetting: fn(),
  openDrawer: fn(),
  openAuthorView: fn(),
  showFeature: fn(),
});

const meta: Meta<typeof SettingsPanel> = {
  title: "Settings/SettingsPanel",
  component: SettingsPanel,
};

export default meta;

type Story = StoryObj<typeof SettingsPanel>;

export const PlayerWithAStoryHidesAuthorControls: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Memory model")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Story for this chat")).toHaveValue("sun-ruins");
    await expect(canvasElement.querySelector("#so-curator-enabled")).toBeNull();
    await expect(canvasElement.querySelector("#so-copilot-enabled")).toBeNull();
    await expect(canvasElement.querySelector("[data-so='engine-status']")).toBeNull();
  },
};

export const AuthorViewShowsAuthorControls: Story = {
  args: { snapshot: snapshot(true), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Memory model")).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-curator-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-copilot-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("[data-so='engine-status']")).toHaveTextContent("Hydrated The Quest for the Sun Ruins");
  },
};

export const HelpOpensFromTheHeader: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Help: what each part does" }));
    await waitFor(() => expect(canvasElement.querySelector('[data-so="help-panel"]')).not.toBeNull());
    await expect(canvasElement.querySelector('[data-so="help-feature"][data-audience="author"]')).toBeNull();
    const memory = canvasElement.querySelector('[data-so="help-feature"][data-feature="memory"]') as HTMLElement;
    await userEvent.click(within(memory).getByRole("button", { name: "Show me" }));
    await expect(args.host.showFeature).toHaveBeenCalledWith(expect.objectContaining({ selector: "#so-extraction-profile" }));
  },
};

export const JudgeGroupArrivesFromItsLazyChunk: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("#so-judge")).not.toBeNull());
    await expect(canvasElement.querySelector("#so-judge-status")).not.toBeNull();
    await expect(canvasElement.querySelector("[data-so='lazy-failed']")).toBeNull();
  },
};

const AREA_IDS = ["so-area-play", "so-area-memory", "so-area-characters", "so-area-world", "so-area-images", "so-area-judge", "so-area-authoring", "so-area-setup"];

const sectionIds = (root: HTMLElement) => [...root.querySelectorAll<HTMLDetailsElement>('[data-so="settings-area"]')].map((section) => section.id);

export const PlayerSeesTheSectionsInReadmeOrder: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    await expect(sectionIds(canvasElement)).toEqual(AREA_IDS.filter((id) => id !== "so-area-authoring"));
    await expect((canvasElement.querySelector("#so-area-play") as HTMLDetailsElement).open).toBe(true);
    await expect((canvasElement.querySelector("#so-area-memory") as HTMLDetailsElement).open).toBe(false);
    await expect(canvasElement.querySelector("#so-area-play > summary")?.textContent).toContain("Which story this chat plays");
    await expect(canvasElement.querySelector("#so-area-memory #so-extraction-profile")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-area-images #so-image-settings")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-area-characters #so-chain-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-inner-voice-settings")).toBeNull();
    await expect(canvasElement.querySelector("#so-warden-enabled")).toBeNull();
  },
};

export const AuthorSeesEverySection: Story = {
  args: { snapshot: snapshot(true), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    await expect(sectionIds(canvasElement)).toEqual(AREA_IDS);
    await expect(canvasElement.querySelector("#so-area-authoring #so-copilot-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-area-memory #so-warden-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-area-world #so-curator-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-area-setup [data-so='engine-status']")).not.toBeNull();
    await waitFor(() => expect(canvasElement.querySelector("#so-inner-voice-settings")).not.toBeNull());
    await waitFor(() => expect(canvasElement.querySelector("#so-chapter-advanced")).not.toBeNull());
  },
};

export const GuideButtonOpensTheAreaPage: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager(), host: { ...host(), openGuide: fn() } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Read the guide: Memory" }));
    await expect(args.host.openGuide).toHaveBeenCalledWith("setup/memory-model.md");
    await expect((canvasElement.querySelector("#so-area-memory") as HTMLDetailsElement).open).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: "Read the guide: Playing" }));
    await expect(args.host.openGuide).toHaveBeenLastCalledWith("player/playing.md");
    await expect((canvasElement.querySelector("#so-area-play") as HTMLDetailsElement).open).toBe(true);
  },
};

export const AdvancedFoldHoldsTheChatNote: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    const fold = canvasElement.querySelector("#so-area-play-advanced") as HTMLDetailsElement;
    await expect(fold.open).toBe(false);
    await expect(fold.querySelector("#so-announce-transitions")).not.toBeNull();
    await userEvent.click(within(fold).getByText("Advanced"));
    await expect(fold.open).toBe(true);
  },
};

export const OpeningASectionIsRemembered: Story = {
  args: { snapshot: snapshot(false), manager: fakeManager(), host: host() },
  play: async ({ canvasElement }) => {
    const memory = canvasElement.querySelector("#so-area-memory") as HTMLDetailsElement;
    await userEvent.click(memory.querySelector("summary") as HTMLElement);
    await waitFor(() => expect(getGlobalSettings().help.openSections).toEqual(["play", "memory"]));
    await userEvent.click(canvasElement.querySelector("#so-area-play > summary") as HTMLElement);
    await waitFor(() => expect(getGlobalSettings().help.openSections).toEqual(["memory"]));
  },
};
