import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "@storybook/test";
import { defaultSpriteSettings } from "./settings";
import type { SpriteStage, StageActor, StageView } from "./stage";
import { VnStage } from "./VnStage";
import { StreamActivity } from "./animation";
import { stageMotion } from "./motion/budget";
import { expectFits, VIEWPORTS } from "../../.storybook/fit";

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
  placement: "vn",
  waitsForVn: false,
  actors: [actor("Arin", "#a55"), actor("Companion", "#55a", true)],
  speaking: "Arin",
  talker: null,
  framing: "full",
  settings: { ...defaultSpriteSettings(), enabled: true, explicit: true },
  activation: "user-on",
  capability: "present",
  reducedMotion: false,
  motion: stageMotion({ effects: "full", hostReduced: false, osReduced: false, storyMotion: true }),
  active: true,
  headSession: "synthetic",
  ...patch,
});

const stage = (current: StageView, activity?: StreamActivity): SpriteStage => ({ subscribe: () => () => {}, view: () => current, activity }) as unknown as SpriteStage;

const scripted = new StreamActivity();
const SCRIPT = "Hello there, friend. I see you made it through the old gate at last.";
const talking = { ...actor("Arin", "#a55"), frames: { talk: swatch("#222"), talk2: swatch("#777") } };

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

export const AlwaysStripInTheChatColumn: Story = {
  args: { stage: stage(view({ placement: "strip", actors: [actor("Arin", "#a55"), actor("Companion", "#55a"), actor("Scout", "#5a5")] })) },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector("#so-vn-stage");
    await expect(root).toHaveAttribute("data-placement", "strip");
    const sprites = [...canvasElement.querySelectorAll<HTMLElement>(".so-sprite")];
    await expect(sprites).toHaveLength(3);
    for (const sprite of sprites) await expect(sprite.style.width.endsWith("%")).toBe(true);
  },
};

export const HiddenRendersNothing: Story = {
  args: { stage: stage(view({ visible: false })) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-vn-stage")).toBeNull();
  },
};

export const PhoneUsesTheStrip: Story = {
  args: { stage: stage(view({ placement: "strip", speaking: "Companion", talker: "Arin" })) },
  parameters: { testViewport: VIEWPORTS.phone },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector("#so-vn-stage");
    await expect(root).toHaveAttribute("data-placement", "strip");
    const sprites = [...canvasElement.querySelectorAll<HTMLElement>(".so-sprite")];
    await expect(sprites).toHaveLength(2);
    await expect(sprites[0]).toHaveClass("so-talking");
    await expect(sprites[1]).toHaveClass("so-speaking");
    await expectFits(canvasElement, sprites[1]);
  },
};

export const ScriptedStreamedReplyMovesTheMouthWithTheWords: Story = {
  args: { stage: stage(view({ actors: [talking], settings: { ...defaultSpriteSettings(), enabled: true, explicit: true, mouth: "smooth", blink: false } }), scripted) },
  play: async ({ canvasElement }) => {
    await scripted.visemes();
    const seen = new Set<string>();
    const mouth = () => [...canvasElement.querySelectorAll<HTMLImageElement>(".so-face-overlay")].find((image) => image.style.opacity === "1");
    for (let at = 1; at <= SCRIPT.length; at += 1) {
      scripted.pulse("Arin", SCRIPT.slice(0, at));
      await new Promise((resolve) => setTimeout(resolve, 35));
      const open = mouth();
      if (open) seen.add(open.getAttribute("src") ?? "");
    }
    await waitFor(() => expect(seen.size).toBeGreaterThan(0));
    await expect([...seen].every((src) => src === talking.frames.talk || src === talking.frames.talk2)).toBe(true);
    scripted.stop();
    await waitFor(() => expect(mouth()).toBeUndefined());
  },
};
