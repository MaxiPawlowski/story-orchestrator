import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
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
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const profile = canvas.getByLabelText("Memory model");
    await expect(profile).toHaveAttribute("id", "so-extraction-profile");
    await expect(profile.tagName).toBe("SELECT");
    const enabled = canvas.getByRole("checkbox", { name: "Let the story move forward on its own" });
    await expect(enabled).toBeChecked();
    await expect(canvasElement.querySelector("#so-not-configured")).not.toBeNull();
    await expect(canvas.getByRole("button", { name: "Test memory model" })).toBeDisabled();
    await userEvent.click(enabled);
    await expect(args.manager.setExtractionSettings).toHaveBeenCalledWith({ enabled: false });
    await userEvent.selectOptions(canvas.getByLabelText("Reply thinking"), "high");
    await expect(args.manager.setExtractionSettings).toHaveBeenCalledWith({ replyEffort: "high" });
  },
};

export const ExtractionOff: Story = {
  args: { snapshot: snapshot({ enabled: false }), manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("checkbox", { name: "Let the story move forward on its own" })).not.toBeChecked();
    await expect(canvasElement.querySelector("#so-not-configured")).toBeNull();
  },
};
