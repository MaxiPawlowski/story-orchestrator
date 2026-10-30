import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { resolveFeatures } from "@runtime/featureResolve";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import { STORY_FEATURE_IDS } from "@engine/featurePolicy";
import { FeatureList } from "./FeatureList";

const install = resolveFeatures(defaultGlobalSettings(), null);
const chat = resolveFeatures(defaultGlobalSettings(), { features: { rumors: "off" } }, { reading: { cadence: 3 }, pacing: { enabled: false } });

const meta: Meta<typeof FeatureList> = {
  title: "Kit/FeatureList",
  component: FeatureList,
  decorators: [(Story) => <div id="so-workspace-modal" style={{ maxWidth: "64rem" }}><Story /></div>],
  args: { scope: "install", resolved: install, onChange: fn(), onReset: fn(), meta: (feature) => `Model: none · Writes something for ${feature}` },
};

export default meta;

type Story = StoryObj<typeof FeatureList>;

const rows = (root: HTMLElement) => root.querySelectorAll('[data-so="feature-row"]');

export const InstallListsEveryFeatureWithAnInlineSwitch: Story = {
  play: async ({ canvasElement, args }) => {
    await expect(rows(canvasElement)).toHaveLength(STORY_FEATURE_IDS.length);
    const toggle = canvasElement.querySelector("#so-feature-pacing-enabled") as HTMLElement;
    await expect(toggle).toHaveAttribute("role", "switch");
    await userEvent.click(toggle);
    await expect(args.onChange).toHaveBeenCalledWith("pacing", "enabled", false);
    await expect(canvasElement.querySelectorAll('[data-so="setting-scope"]')).toHaveLength(0);
    await expect(canvasElement.querySelector('[data-feature="reading"] [data-so="feature-meta"]')).toHaveTextContent("Writes something for reading");
  },
};

export const MultiControlFeaturesExpandInPlace: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-feature-thinking-effort")).toBeNull();
    await userEvent.click(canvasElement.querySelector("#so-feature-thinking-toggle") as HTMLElement);
    const effort = canvas.getByRole("radiogroup", { name: "Thinking effort" });
    await expect(within(effort).getByRole("radio", { name: "Medium · 400 tokens" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(effort).getByRole("radio", { name: "High · no cap" }));
    await expect(args.onChange).toHaveBeenCalledWith("thinking", "effort", "high");
    await expect(canvasElement.querySelectorAll("details")).toHaveLength(0);
  },
};

export const ExpandedOnArrivalForADeepLink: Story = {
  args: { expanded: "reading" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-feature-reading-cadence")).toHaveAttribute("type", "number");
    await expect(canvasElement.querySelector("#so-feature-reading-toggle")).toHaveAttribute("aria-expanded", "true");
  },
};

export const ChatScopeShowsWhereEachValueComesFrom: Story = {
  args: { scope: "chat", resolved: chat, expanded: "reading" },
  play: async ({ canvasElement, args }) => {
    const pacing = canvasElement.querySelector('[data-feature="pacing"]') as HTMLElement;
    await expect(within(pacing).getByText("This chat")).toBeInTheDocument();
    await userEvent.click(within(pacing).getByRole("button", { name: "Reset Tension and pacing" }));
    await expect(args.onReset).toHaveBeenCalledWith("pacing", "enabled");
    await expect(within(canvasElement.querySelector('[data-feature="rumors"]') as HTMLElement).getByText("Story")).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-feature-reading-cadence")).toHaveValue(3);
  },
};

export const FilterNarrowsTheList: Story = {
  args: { scope: "chat", resolved: chat },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox", { name: "Filter features" }), "lore");
    await expect([...rows(canvasElement)].map((row) => row.getAttribute("data-feature"))).toEqual(["curator", "memoryLore", "lateLore"]);
    await userEvent.clear(canvas.getByRole("searchbox", { name: "Filter features" }));
    await userEvent.click(canvas.getByRole("radio", { name: "Changed" }));
    await expect([...rows(canvasElement)].map((row) => row.getAttribute("data-feature"))).toEqual(["reading", "pacing"]);
  },
};

export const LinksAndHomesElsewhere: Story = {
  args: {
    links: (feature) => feature === "speakers" ? [{ label: "Judge: 1 of 1 on", onOpen: fn() }] : [],
    homeElsewhere: (feature) => feature === "illustrations" ? { id: "so-feature-illustrations-home", label: "On · Images & stage", onOpen: fn() } : null,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Judge: 1 of 1 on" })).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-feature-illustrations-enabled")).toBeNull();
    await expect(canvasElement.querySelector("#so-feature-illustrations-home")).toHaveTextContent("Images & stage");
    await expect(canvasElement.querySelector("#so-feature-illustrations-toggle")).toBeNull();
  },
};
