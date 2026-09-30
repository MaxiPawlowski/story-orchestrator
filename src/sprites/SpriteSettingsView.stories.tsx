import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent } from "@storybook/test";
import { defaultSpriteSettings } from "./settings";
import { SpriteSettingsView } from "./SpriteSettingsView";

const meta: Meta<typeof SpriteSettingsView> = {
  title: "Settings/SpriteSettingsView",
  component: SpriteSettingsView,
  args: {
    settings: defaultSpriteSettings(),
    activation: "off",
    capability: "present",
    profiles: [{ id: "p1", name: "Artemis" }],
    onStage: "",
    onChange: fn(),
    onSwitch: fn(),
    onStoryDecides: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof SpriteSettingsView>;

const box = (root: HTMLElement) => root.querySelector<HTMLInputElement>("#so-sprite-enabled");

export const OffByDefault: Story = {
  play: async ({ canvasElement, args }) => {
    await expect(box(canvasElement)?.checked).toBe(false);
    await expect(canvasElement.querySelector("#so-sprite-activation")?.getAttribute("data-activation")).toBe("off");
    await expect(canvasElement.querySelector("#so-sprite-story-decides")).toBeNull();
    await userEvent.click(box(canvasElement) as HTMLInputElement);
    await expect(args.onSwitch).toHaveBeenCalledWith(true);
  },
};

export const StoryTurnsItOn: Story = {
  args: { activation: "story", onStage: "On stage: Belle (default, smirk)" },
  play: async ({ canvasElement, args }) => {
    await expect(box(canvasElement)?.checked).toBe(true);
    await expect(canvasElement.querySelector("#so-sprite-activation")?.textContent).toContain("its story directs a stage");
    await userEvent.click(box(canvasElement) as HTMLInputElement);
    await expect(args.onSwitch).toHaveBeenCalledWith(false);
  },
};

export const UserSwitchedOffWinsOverTheStory: Story = {
  args: { activation: "user-off", settings: { ...defaultSpriteSettings(), explicit: true } },
  play: async ({ canvasElement, args }) => {
    await expect(box(canvasElement)?.checked).toBe(false);
    await userEvent.click(canvasElement.querySelector("#so-sprite-story-decides") as HTMLButtonElement);
    await expect(args.onStoryDecides).toHaveBeenCalledTimes(1);
  },
};

export const RouteAbsent: Story = {
  args: { capability: "absent" },
  play: async ({ canvasElement }) => {
    await expect(box(canvasElement)?.disabled).toBe(true);
    await expect(canvasElement.querySelector("#so-sprite-capability")?.textContent).toContain("/api/sprites");
  },
};
