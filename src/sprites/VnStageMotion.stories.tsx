import type { Meta, StoryObj } from "@storybook/react";
import { expect, waitFor } from "@storybook/test";
import { defaultSpriteSettings } from "./settings";
import type { SpriteStage, StageActor, StageView } from "./stage";
import { VnStage } from "./VnStage";
import { stageMotion, type MotionSwitches } from "./motion/budget";
import { MotionFeed } from "./motion/feed";
import type { StageSignals } from "./motion/cues";

const swatch = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="120"><rect width="40" height="120" fill="${color}"/></svg>`)}`;

const actor = (name: string, color: string, label = "neutral"): StageActor => ({ name, avatar: `${name.toLowerCase()}.png`, label, path: swatch(color), set: "default", spotlight: false });

const ARIN = actor("Arin", "#a55");
const MIRA = actor("Mira", "#55a");
const SCOUT = actor("Scout", "#5a5");
const FULL: MotionSwitches = { effects: "full", hostReduced: false, osReduced: false, storyMotion: true };

const baseView = (switches: MotionSwitches, patch: Partial<StageView> = {}): StageView => ({
  visible: true, placement: "vn", waitsForVn: false, actors: [ARIN, MIRA], speaking: null, talker: null, framing: "full",
  settings: { ...defaultSpriteSettings(), enabled: true, explicit: true, effects: switches.effects }, activation: "user-on", capability: "present",
  reducedMotion: switches.hostReduced || !switches.storyMotion, motion: stageMotion(switches), active: true, headSession: "story", ...patch,
});

interface ScriptedStage { stage: SpriteStage; set(patch: Partial<StageView>): void; feed: MotionFeed }

const scripted = (start: StageView): ScriptedStage => {
  let current = start;
  let boundary = 1;
  const listeners = new Set<() => void>();
  const feed = new MotionFeed();
  const stage = {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    view: () => current, boundary: () => boundary++, motionFeed: feed,
  } as unknown as SpriteStage;
  return { stage, feed, set: (patch) => { current = { ...current, ...patch }; listeners.forEach((listener) => listener()); } };
};

const signals = (patch: Partial<StageSignals>): StageSignals => ({
  session: "story", boundary: 1, checkpoint: "cp1", background: null, transition: null, tension: "calm", chapters: 0, chapterLabel: null, chapterTitle: null, chapterCards: true, ...patch,
});

const sprites = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(".so-sprite")];
const named = (root: HTMLElement, name: string) => sprites(root).find((sprite) => sprite.dataset.name === name);
const actOf = (sprite: HTMLElement | undefined) => sprite?.querySelector<HTMLElement>(".so-sprite-act") ?? null;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const meta: Meta<typeof VnStage> = { title: "Sprites/VnStage motion", component: VnStage };
export default meta;
type Story = StoryObj<typeof VnStage>;

const entrances = scripted(baseView(FULL));
export const FullEnterExitAndMove: Story = {
  args: { stage: entrances.stage },
  play: async ({ canvasElement }) => {
    await expect(sprites(canvasElement).every((sprite) => sprite.dataset.phase === "stay")).toBe(true);
    const before = named(canvasElement, "Mira")?.style.left;
    entrances.set({ actors: [ARIN, MIRA, SCOUT] });
    await waitFor(() => expect(named(canvasElement, "Scout")).toHaveClass("so-enter"));
    await expect(named(canvasElement, "Scout")).toHaveAttribute("data-enter", "rise");
    await expect(named(canvasElement, "Mira")?.style.left).not.toBe(before);
    await expect(canvasElement.querySelector<HTMLElement>("#so-vn-stage")?.style.getPropertyValue("--so-move-ms")).toBe("500ms");
    entrances.set({ actors: [ARIN, SCOUT] });
    await waitFor(() => expect(named(canvasElement, "Mira")).toHaveClass("so-exit"));
    await waitFor(() => expect(named(canvasElement, "Mira")).toBeUndefined(), { timeout: 2000 });
    await expect(canvasElement.querySelector(".so-sprite-sway.so-swaying")).not.toBeNull();
  },
};

const reduced = scripted(baseView({ ...FULL, osReduced: true }));
export const ReducedMotionFadesOnly: Story = {
  args: { stage: reduced.stage },
  play: async ({ canvasElement }) => {
    reduced.set({ actors: [ARIN, MIRA, SCOUT] });
    const scout = await waitFor(() => { const found = named(canvasElement, "Scout"); expect(found).toHaveClass("so-enter"); return found as HTMLElement; });
    await expect(scout).toHaveAttribute("data-enter", "fade");
    await expect(scout.style.getPropertyValue("--so-enter-ms")).toBe("150ms");
    await expect(canvasElement.querySelector<HTMLElement>("#so-vn-stage")).toHaveAttribute("data-motion", "reduced");
    await expect(canvasElement.querySelector(".so-swaying")).toBeNull();
    reduced.set({ speaking: "Arin", actors: [{ ...ARIN, label: "joy" }, MIRA, SCOUT] });
    await pause(300);
    await expect(actOf(named(canvasElement, "Arin"))?.getAnimations().length ?? 0).toBe(0);
  },
};

const reacting = scripted(baseView(FULL));
export const FullReactsAndHops: Story = {
  args: { stage: reacting.stage },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector(".so-stage-vignette")).not.toBeNull());
    reacting.set({ actors: [{ ...ARIN, label: "surprise" }, MIRA] });
    await waitFor(() => expect(actOf(named(canvasElement, "Arin"))?.getAnimations().length).toBeGreaterThan(0));
    await pause(700);
    reacting.set({ speaking: "Mira" });
    await waitFor(() => expect(actOf(named(canvasElement, "Mira"))?.getAnimations().length).toBeGreaterThan(0));
    await expect(canvasElement.querySelector("#so-vn-stage")).toHaveAttribute("data-blur", "true");
  },
};

const calm = scripted(baseView({ ...FULL, effects: "calm" }));
export const CalmKeepsStill: Story = {
  args: { stage: calm.stage },
  play: async ({ canvasElement }) => {
    calm.set({ actors: [{ ...ARIN, label: "anger" }, MIRA], speaking: "Arin" });
    await pause(400);
    await expect(actOf(named(canvasElement, "Arin"))?.getAnimations().length ?? 0).toBe(0);
    await expect(canvasElement.querySelector(".so-swaying")).toBeNull();
    await expect(canvasElement.querySelector("#so-vn-stage")).not.toHaveAttribute("data-blur");
  },
};

const moods = scripted(baseView(FULL));
export const TensionVignetteAndChapterCard: Story = {
  args: { stage: moods.stage },
  play: async ({ canvasElement }) => {
    const vignette = await waitFor(() => { const found = canvasElement.querySelector<HTMLElement>(".so-stage-vignette"); expect(found).not.toBeNull(); return found as HTMLElement; });
    moods.feed.update(signals({ boundary: 1 }));
    moods.feed.update(signals({ boundary: 2, tension: "critical", chapters: 1, chapterLabel: "Chapter 2", chapterTitle: "The Road North" }));
    await waitFor(() => expect(vignette).toHaveAttribute("data-tension", "critical"));
    await expect(Number(vignette.style.opacity)).toBeCloseTo(0.3);
    const card = await waitFor(() => { const found = canvasElement.querySelector<HTMLElement>("[data-so=stage-chapter-card]"); expect(found).not.toBeNull(); return found as HTMLElement; });
    await expect(card.textContent).toContain("The Road North");
    await expect(card.textContent).toContain("Chapter 2");
    card.click();
    await waitFor(() => expect(canvasElement.querySelector("[data-so=stage-chapter-card]")).toBeNull());
  },
};

const covers = scripted(baseView(FULL));
export const AuthoredFadeCoversTheStage: Story = {
  args: { stage: covers.stage },
  play: async ({ canvasElement }) => {
    const cover = await waitFor(() => { const found = canvasElement.querySelector<HTMLElement>(".so-stage-cover"); expect(found).not.toBeNull(); return found as HTMLElement; });
    covers.feed.update(signals({ boundary: 1 }));
    covers.feed.update(signals({ boundary: 2, checkpoint: "cp2", transition: { kind: "fade", ms: 1500, color: "#fff" } }));
    await waitFor(() => expect(cover.getAnimations().length).toBeGreaterThan(0));
    await expect(cover.style.backgroundColor).toBe("rgb(255, 255, 255)");
  },
};

const off = scripted(baseView({ ...FULL, effects: "off" }));
export const EffectsOff: Story = {
  args: { stage: off.stage },
  play: async ({ canvasElement }) => {
    off.set({ actors: [ARIN, MIRA, SCOUT] });
    await waitFor(() => expect(named(canvasElement, "Scout")).toBeDefined());
    await expect(named(canvasElement, "Scout")).not.toHaveClass("so-enter");
    await expect(canvasElement.querySelector(".so-stage-vignette")).toBeNull();
  },
};
