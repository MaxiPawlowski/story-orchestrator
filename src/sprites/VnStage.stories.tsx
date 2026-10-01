import type { Meta, StoryObj } from "@storybook/react";
import { expect } from "@storybook/test";
import { defaultSpriteSettings } from "./settings";
import type { SpriteStage, StageActor, StageView } from "./stage";
import { VnStage } from "./VnStage";

const swatch = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="120"><rect width="40" height="120" fill="${color}"/></svg>`)}`;

const actor = (name: string, color: string, spotlight = false): StageActor => ({
  name,
  avatar: `${name.toLowerCase()}.png`,
  label: "neutral",
  path: swatch(color),
  set: "default",
  spotlight,
});

const view = (patch: Partial<StageView> = {}): StageView => ({
  visible: true,
  actors: [actor("Arin", "#a55"), actor("Companion", "#55a", true)],
  speaking: "Arin",
  framing: "full",
  settings: { ...defaultSpriteSettings(), enabled: true, explicit: true },
  activation: "user-on",
  capability: "present",
  reducedMotion: false,
  ...patch,
});

const stage = (current: StageView): SpriteStage => ({ subscribe: () => () => {}, view: () => current }) as unknown as SpriteStage;

const meta: Meta<typeof VnStage> = {
  title: "Sprites/VnStage",
  component: VnStage,
};

export default meta;

type Story = StoryObj<typeof VnStage>;

export const TwoActorsOneSpeaking: Story = {
  args: { stage: stage(view()) },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector("#so-vn-stage");
    await expect(root).toHaveAttribute("aria-hidden", "true");
    await expect(root).toHaveAttribute("data-framing", "full");
    const sprites = [...canvasElement.querySelectorAll<HTMLElement>(".so-sprite")];
    await expect(sprites.map((sprite) => sprite.dataset.name)).toEqual(["Arin", "Companion"]);
    await expect(sprites[0]).toHaveClass("so-speaking");
    await expect(sprites[1]).toHaveClass("so-idle");
    await expect(sprites[1]).toHaveClass("so-spotlight");
    await expect(sprites[0].querySelector("img")).toHaveAttribute("alt", "Arin (neutral)");
  },
};

export const SoloActorHasNoFocusDimming: Story = {
  args: { stage: stage(view({ actors: [actor("Arin", "#a55")], reducedMotion: true })) },
  play: async ({ canvasElement }) => {
    const sprite = canvasElement.querySelector<HTMLElement>(".so-sprite");
    await expect(sprite).not.toHaveClass("so-speaking");
    await expect(sprite).not.toHaveClass("so-idle");
    await expect(sprite).not.toHaveClass("so-breathing");
  },
};

export const HiddenRendersNothing: Story = {
  args: { stage: stage(view({ visible: false })) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-vn-stage")).toBeNull();
  },
};
