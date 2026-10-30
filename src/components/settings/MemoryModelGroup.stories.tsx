import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { MemoryModelGroup } from "./MemoryModelGroup";

const snapshot = (settings: Record<string, unknown> = {}): RuntimeSnapshot =>
  ({
    extraction: { settings: { enabled: true, profileId: null, cadence: 3, stabilityLag: 0, ...settings } },
    memory: { settings: { epistemicLedgerCapable: true } },
    roleRoutes: [],
    modelCallRing: [],
    ui: { authorView: false },
  }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager => ({ setExtractionSettings: fn(), setMemorySettings: fn() }) as unknown as RuntimeManager;

const meta: Meta<typeof MemoryModelGroup> = {
  title: "Settings/MemoryModelGroup",
  component: MemoryModelGroup,
};

export default meta;

type Story = StoryObj<typeof MemoryModelGroup>;

export const NotConfigured: Story = {
  args: { snapshot: snapshot(), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const profile = canvas.getByLabelText("Memory model");
    await expect(profile).toHaveAttribute("id", "so-extraction-profile");
    await expect(profile.tagName).toBe("SELECT");
    await expect(canvasElement.querySelector("#so-not-configured")).not.toBeNull();
    await expect(canvas.getByRole("button", { name: "Test memory model" })).toBeDisabled();
    await expect(canvasElement.querySelector("#so-reply-effort-open")).not.toBeNull();
  },
};

export const ExtractionOff: Story = {
  args: { snapshot: snapshot({ enabled: false }), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("switch", { name: "Let the story move forward on its own" })).toBeNull();
    await expect(canvasElement.querySelector("#so-not-configured")).toBeNull();
  },
};
