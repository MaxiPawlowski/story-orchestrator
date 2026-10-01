import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, within } from "@storybook/test";
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
    storyIdentity: { id: "sun-ruins", playedVersion: 1, libraryVersion: 1, pinned: true, drifted: false },
    library: [{ id: "sun-ruins", title: "The Quest for the Sun Ruins" }],
    validationErrors: [],
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    saveHealth: createSaveHealth(),
    copilot: { enabled: true },
    extraction: { settings: { enabled: true, profileId: "artemis", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 } },
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
  extensionVersion: "2.6.0",
  memoryModelLimit: () => null,
  recheckMemoryModel: fn(),
  openWizard: fn(),
  openStudio: fn(),
  openWizardForRequirements: fn(),
  revealSetting: fn(),
  openDrawer: fn(),
  openAuthorView: fn(),
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
    await expect(await canvas.findByLabelText("Memory model profile")).toBeInTheDocument();
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
    await expect(await canvas.findByLabelText("Memory model profile")).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-curator-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-copilot-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("[data-so='engine-status']")).toHaveTextContent("Hydrated The Quest for the Sun Ruins");
  },
};
