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
    copilot: { enabled: true, ask: true },
    extraction: { settings: { enabled: true, profileId: "artemis", cadence: 3, stabilityLag: 0, replyEffort: "medium" } },
    memory: { settings: { epistemicLedgerCapable: true, chapters: {} } },
    features: { memoryLore: { enabled: true }, lateLore: { enabled: true }, curator: { enabled: false } },
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
    notify: fn(),
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
  decorators: [(Story) => <div id="so-workspace-modal"><Story /></div>],
  args: { snapshot: snapshot(false), manager: fakeManager(), host: host(), navigate: fn() },
};

export default meta;

type Story = StoryObj<typeof SettingsPanel>;

const noAccordions = (root: HTMLElement) => expect(root.querySelector('[data-so="settings-area"], details.so-section details.so-section')).toBeNull();

export const LibraryHoldsTheEntryPointsOnly: Story = {
  args: { page: "library" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("#so-entry-points")).not.toBeNull());
    await expect(canvasElement.querySelector("#story-library-select")).toBeNull();
    await expect(canvasElement.querySelector("#so-copilot-enabled")).toBeNull();
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Import a story" }));
    await waitFor(() => expect(canvasElement.querySelector("#so-entry-import #so-import-text")).not.toBeNull());
    noAccordions(canvasElement);
  },
};

export const ModelsHoldsTheMemoryModelAndTasks: Story = {
  args: { page: "models" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText("Memory model")).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-reply-effort")).toBeNull();
    await expect(canvasElement.querySelector("#so-extraction-cadence")).toBeNull();
    await waitFor(() => expect(canvasElement.querySelector("#so-role-profiles")).not.toBeNull());
    await expect(canvasElement.querySelector("#so-epistemic-capable")?.closest("details")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Change" }));
    await expect(args.navigate).toHaveBeenCalledWith({ context: "orchestrator", page: "features", feature: "thinking" }, "so-feature-thinking-effort");
    noAccordions(canvasElement);
  },
};

export const JudgeIsTheOneEditableHomeOfItsUses: Story = {
  args: { page: "judge" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("#so-judge")).not.toBeNull());
    await expect(canvasElement.querySelector("#so-judge-status")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-judge-uses")?.tagName).toBe("SECTION");
    await expect(canvasElement.querySelector("[data-so='lazy-failed']")).toBeNull();
  },
};

export const WorldLinksToItsFeatureRows: Story = {
  args: { page: "world" },
  play: async ({ canvasElement, args }) => {
    await expect(canvasElement.querySelector("#so-wi-gating-mode")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-wi-scan-memory")).toBeNull();
    await userEvent.click(canvasElement.querySelector("#so-feature-link-lateLore") as HTMLElement);
    await expect(args.navigate).toHaveBeenCalledWith({ context: "orchestrator", page: "features", feature: "lateLore" }, "so-feature-lateLore-enabled");
  },
};

export const AuthoringHoldsTheWizardAskAndBudget: Story = {
  args: { page: "authoring" },
  play: async ({ canvasElement, args }) => {
    await expect(canvasElement.querySelector("#so-copilot-enabled")).not.toBeNull();
    await expect(canvasElement.querySelector("#so-copilot-ask")).not.toBeNull();
    await waitFor(() => expect(canvasElement.querySelector("#so-chapter-budget")).not.toBeNull());
    await userEvent.click(canvasElement.querySelector("#so-authoring-author-view") as HTMLElement);
    await expect(args.navigate).toHaveBeenCalledWith({ context: "story", page: "features" }, "so-author-view-switch");
  },
};

export const DiagnosticsHidesTheEngineFromThePlayer: Story = {
  args: { page: "diagnostics" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("#so-capabilities")).not.toBeNull());
    await expect(canvasElement.querySelector("[data-so='engine-status']")).toBeNull();
  },
};

export const AuthorViewShowsTheEngineStatus: Story = {
  args: { page: "diagnostics", snapshot: snapshot(true) },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("[data-so='engine-status']")).toHaveTextContent("Hydrated The Quest for the Sun Ruins"));
  },
};

export const HelpOpensTheFloatingPanel: Story = {
  args: { page: "help" },
  play: async ({ canvasElement, args }) => {
    await expect(canvasElement.querySelector("#so-copilot-enabled")).toBeNull();
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Help and Ask" }));
    await expect(args.host.openPanel).toHaveBeenCalledWith("help");
  },
};

export const DisplayHasOneHomePerSetting: Story = {
  args: { page: "display" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("#so-hud-enabled")).not.toBeNull());
    await expect(canvasElement.querySelectorAll("#so-inline-level")).toHaveLength(1);
    await expect(canvasElement.querySelector("#so-device-display-hud-enabled")).toHaveAttribute("aria-pressed");
    await expect(canvasElement.querySelector("#so-announce-transitions")).not.toBeNull();
    await expect(canvasElement.querySelector("[data-so='presence-controls']")).not.toBeNull();
    noAccordions(canvasElement);
  },
};
