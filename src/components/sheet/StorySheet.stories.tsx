import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import type { RuntimeSnapshot } from "@runtime/types";
import type { SceneView } from "@runtime/gameTypes";
import { StorySheet, type SheetRoom } from "./StorySheet";
import { sampleGame, sceneWidgetLines } from "../widgets/gameViewFixtures";
import { sampleCodex } from "../codex/codexFixtures";

const scene = (sceneWidgetLines.body.kind === "scene" ? sceneWidgetLines.body : null) as SceneView;

const snapshot = (overrides: Record<string, unknown> = {}): RuntimeSnapshot => ({
  ready: true,
  ui: { authorView: false, inline: { level: 1 }, presence: {} },
  game: { ...sampleGame(), codex: sampleCodex(), scene },
  gameAuthor: null,
  presence: { shown: { journal: true, statSheet: true, widgets: true, suggestions: false, wand: true } },
  memoryShown: [{ id: "m1", text: "The sun-key opens the inner sanctum.", tier: "facts", createdAt: 1 }],
  ...overrides,
}) as unknown as RuntimeSnapshot;

const DESKTOP: SheetRoom = { view: { width: 1920, height: 1080 }, chatRight: 1488, chatTop: 40, formTop: 1000, lastReply: 180 };
const PHONE: SheetRoom = { view: { width: 390, height: 844 }, chatRight: 390, chatTop: 60, formTop: 760, lastReply: 220 };

const meta: Meta<typeof StorySheet> = {
  title: "Panels/Sheet/StorySheet",
  component: StorySheet,
  args: { snapshot: snapshot(), tab: "journal", popped: false, onTab: fn(), onPop: fn(), onClose: fn(), room: DESKTOP, actions: { onJump: fn(), openMemory: fn() } },
};

export default meta;

type Story = StoryObj<typeof StorySheet>;

export const DockedRightOfTheChat: Story = {
  play: async ({ args, canvasElement }) => {
    const sheet = canvasElement.querySelector("#so-sheet") as HTMLElement;
    await expect(sheet).toHaveAttribute("data-mode", "dock");
    await expect(sheet).toHaveAttribute("data-overlay", "false");
    await expect(sheet.style.width).toBe("380px");
    const tabs = [...sheet.querySelectorAll('[data-so="sheet-tab"]')].map((tab) => tab.getAttribute("data-tab"));
    await expect(tabs).toEqual(["journal", "here", "people", "stats", "widget-alarm-clock", "widget-quest-board", "widget-clue-wall", "widget-river-map", "memory"]);
    await waitFor(() => expect(within(sheet).getByText("The ferryman's debt")).toBeVisible());
    await expect(sheet.textContent).not.toMatch(/#\d+ /);
    await userEvent.click(within(sheet).getByRole("tab", { name: "Here now" }));
    await expect(args.onTab).toHaveBeenCalledWith("here");
    await userEvent.click(within(sheet).getByRole("button", { name: "Pop the sheet out into a window" }));
    await expect(args.onPop).toHaveBeenCalledWith(true);
    await userEvent.click(within(sheet).getByRole("button", { name: "Close the story sheet" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const HereNowTab: Story = {
  args: { tab: "here" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('#so-sheet-here [data-so="scene-card"]')).not.toBeNull());
    await expect(canvasElement.querySelector('[data-so="sheet-tab"][data-tab="here"]')).toHaveAttribute("aria-selected", "true");
  },
};

export const StatsValueFirst: Story = {
  args: { tab: "stats" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-so="sheet-value"]')).not.toBeNull());
    const value = canvasElement.querySelector('[data-so="sheet-value"]') as HTMLElement;
    const label = value.parentElement?.querySelector(".so-sheet-stat-label") as HTMLElement;
    await expect(Number.parseFloat(getComputedStyle(value).fontSize)).toBeGreaterThan(Number.parseFloat(getComputedStyle(label).fontSize));
  },
};

export const MemoryTab: Story = {
  args: { tab: "memory" },
  play: async ({ args, canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText("The sun-key opens the inner sanctum.")).toBeVisible());
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open memory" }));
    await expect(args.actions?.openMemory).toHaveBeenCalledTimes(1);
  },
};

export const UnknownTabFallsBackToTheFirst: Story = {
  args: { tab: "ideas" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="sheet-panel"]')).toHaveAttribute("data-tab", "journal");
  },
};

export const OverlaysWhenTheRoomIsNarrow: Story = {
  args: { room: { ...DESKTOP, view: { width: 1280, height: 800 }, chatRight: 1100 } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-sheet")).toHaveAttribute("data-overlay", "true");
  },
};

export const PoppedOutWindow: Story = {
  args: { popped: true },
  play: async ({ args, canvasElement }) => {
    await expect(canvasElement.querySelector("#so-panel-sheet #so-sheet")).toHaveAttribute("data-mode", "window");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Dock the sheet beside the chat" }));
    await expect(args.onPop).toHaveBeenCalledWith(false);
  },
};

export const PhoneBottomSheet: Story = {
  args: { room: PHONE },
  parameters: { testViewport: { width: 390, height: 844 } },
  play: async ({ canvasElement }) => {
    const sheet = canvasElement.querySelector("#so-sheet") as HTMLElement;
    await expect(sheet).toHaveAttribute("data-mode", "bottom");
    await expect(sheet).toHaveAttribute("data-snap", "half");
    const height = Number.parseFloat(sheet.style.height);
    await expect(height).toBeLessThanOrEqual(PHONE.formTop - PHONE.chatTop - PHONE.lastReply);
    await expect(sheet.style.top).toBe(`${PHONE.formTop - height}px`);
    const grip = within(sheet).getByRole("button", { name: /Drag to change the sheet's height/ });
    grip.focus();
    await userEvent.keyboard("{Enter}");
    await expect(sheet).toHaveAttribute("data-snap", "full");
    await userEvent.keyboard("{Enter}");
    await expect(sheet).toHaveAttribute("data-snap", "peek");
    await expect(canvasElement.querySelector('[data-so="sheet-pop"]')).toBeNull();
  },
};

export const ClosesWithoutTabs: Story = {
  args: { snapshot: snapshot({ game: null, memoryShown: undefined }) },
  play: async ({ args, canvasElement }) => {
    await expect(canvasElement.querySelector("#so-sheet")).toBeNull();
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
  },
};
