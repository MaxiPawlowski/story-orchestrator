import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { resolveFeatures } from "@runtime/featureResolve";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { FeaturesPage } from "./FeaturesPage";
import "./workspace.css";

const snapshot = {
  ready: true, features: resolveFeatures(defaultGlobalSettings(), { features: { inner: "off" } }, { inner: { enabled: true } }),
  featureOverrides: { inner: { enabled: true } }, stagecraftScope: [], extraction: { settings: { profileId: "test-model" } }, ui: { authorView: false },
  stagecraft: { settings: defaultGlobalSettings().stagecraft, proposals: [] }, pacing: { shapeOverride: null },
  roleRoutes: [{ role: "read", label: "Story reads", profileId: "p1", state: "ok", detail: "", effort: "default" }],
  memory: { settings: { harvestReasoning: true, epistemicLedgerCapable: false } }, thinkingSilent: true,
} as unknown as RuntimeSnapshot;
const manager = () => ({ setFeatureOverride: fn(() => true), setPacingSettings: fn(), runExtractionNow: fn(), notify: fn(), reapplyPromptBlocks: fn() }) as unknown as RuntimeManager;

const meta: Meta<typeof FeaturesPage> = {
  title: "Workspace/FeaturesPage", component: FeaturesPage,
  decorators: [(Story) => <div id="so-workspace-modal"><Story /></div>],
  args: { snapshot, manager: manager(), scope: "chat", navigate: fn(), profileName: (id) => id === "p1" ? "Memory RunPod" : null },
};
export default meta;
type Story = StoryObj<typeof FeaturesPage>;

export const ChatScopeResetsAnOverride: Story = {
  play: async ({ canvasElement, args }) => {
    const inner = canvasElement.querySelector('[data-feature="inner"]') as HTMLElement;
    await expect(within(inner).getByText(/This chat re-enables/)).toBeInTheDocument();
    await userEvent.click(within(inner).getByRole("button", { name: "Reset Private inner voice" }));
    await expect(args.manager.setFeatureOverride).toHaveBeenCalledWith("inner", null);
  },
};

export const EachRowNamesItsModelAndWhatItWrites: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-feature="reading"] [data-so="feature-meta"]')).toHaveTextContent("Model: Memory RunPod · Writes story progress");
    await expect(canvasElement.querySelector('[data-feature="pacing"] [data-so="feature-meta"]')).toHaveTextContent("No model call");
  },
};

export const JudgeChecksAreALinkNotACheckbox: Story = {
  play: async ({ canvasElement, args }) => {
    const speakers = canvasElement.querySelector('[data-feature="speakers"]') as HTMLElement;
    await expect(speakers.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    await userEvent.click(within(speakers).getByRole("button", { name: /Judge: \d of 1 on/ }));
    await expect(args.navigate).toHaveBeenCalledWith({ context: "orchestrator", page: "judge" }, "so-judge-use-director");
  },
};

export const InnerVoiceModelNotThinking: Story = {
  args: { expanded: "inner" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-inner-harvest-silent")).toHaveTextContent("the model is not thinking");
    await expect(canvasElement.querySelector("#so-inner-harvest-idle")).toBeNull();
    await expect(canvasElement.querySelector("#so-feature-inner-harvestReasoning")).not.toBeNull();
  },
};

export const PacingShapeIsAChatRow: Story = {
  args: { expanded: "pacing" },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("radio", { name: "Three acts" }));
    await expect(args.manager.setPacingSettings).toHaveBeenCalledWith({ shapeOverride: "three_act" });
  },
};

export const InstallScopeSendsStageFeaturesToImages: Story = {
  args: { scope: "install" },
  play: async ({ canvasElement, args }) => {
    await expect(canvasElement.querySelector("#so-feature-sprites-enabled")).toBeNull();
    await userEvent.click(canvasElement.querySelector("#so-feature-sprites-home") as HTMLElement);
    await expect(args.navigate).toHaveBeenCalledWith({ context: "orchestrator", page: "images" }, "so-sprite-settings");
    await expect(canvasElement.querySelector("#so-feature-pacing-enabled")).toHaveAttribute("role", "switch");
  },
};
