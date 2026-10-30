import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RuntimeSnapshot } from "@runtime/types";
import { HudCard } from "./HudCard";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const snapshot = (overrides: Record<string, unknown> = {}): RuntimeSnapshot => ({
  ready: true,
  narrative: { title: "Quest", headline: "The Ruined Gate", sections: [{ id: "now", label: "Where you are", lines: ["The Ruined Gate", "Breach the sanctum."] }], text: "" },
  ui: { authorView: false, inline: { level: 1 } },
  pipeline: { state: "idle", text: "Following along.", detail: null, needsSetup: false, nextAction: "wait" },
  game: null,
  ...overrides,
}) as unknown as RuntimeSnapshot;

const TABS = [
  { id: "journal" as const, label: "Journal", icon: "fa-book" },
  { id: "here" as const, label: "Here now", icon: "fa-user-group" },
  { id: "stats" as const, label: "Stats", icon: "fa-list-check" },
  { id: "widget-board" as const, label: "Case board", icon: "fa-table-columns" },
  { id: "widget-map" as const, label: "Map", icon: "fa-table-columns" },
  { id: "ideas" as const, label: "Ideas", icon: "fa-lightbulb" },
  { id: "memory" as const, label: "Memory", icon: "fa-brain" },
];

const meta: Meta<typeof HudCard> = {
  title: "Drawer/HudCard",
  component: HudCard,
  args: { snapshot: snapshot(), tabs: TABS, openTab: fn(), onRetry: fn(), onOpenSettings: fn(), setLevel: fn(), onMore: fn(), onClose: fn() },
  render: (args) => <div style={{ position: "relative", paddingTop: 420 }}><HudCard {...args} /></div>,
};

export default meta;

type Story = StoryObj<typeof HudCard>;

export const PlayerCard: Story = {
  play: async ({ args, canvasElement }) => {
    const card = within(canvasElement).getByRole("dialog", { name: "The Ruined Gate" });
    await expect([...card.querySelectorAll('[data-so="hud-card-tab"]')].map((tab) => tab.getAttribute("data-tab")))
      .toEqual(["journal", "here", "stats", "ideas", "memory", "widget-board"]);
    await expect(canvasElement.querySelector("#so-hud-card-level")).toBeNull();
    await expect(within(card).queryByRole("button", { name: "Try again" })).toBeNull();
    await userEvent.click(within(card).getByRole("button", { name: "Here now" }));
    await expect(args.openTab).toHaveBeenCalledWith("here");
    await expect(args.onClose).toHaveBeenCalledWith(false);
  },
};

export const StalledReadOffersTryAgain: Story = {
  args: { snapshot: snapshot({ pipeline: { state: "stalled-rechecking", text: "Reading is taking longer than usual. It keeps going; Try again checks on it.", detail: null,
    needsSetup: false, nextAction: "retry", retryable: true } }) },
  play: async ({ args, canvasElement }) => {
    const status = canvasElement.querySelector("#so-hud-card-status") as HTMLElement;
    await expect(status).toHaveAttribute("data-state", "stalled-rechecking");
    await userEvent.click(within(status).getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

export const NeedsSetupOffersSettings: Story = {
  args: { snapshot: snapshot({ pipeline: { state: "not-configured", text: "Nothing is following the story yet — choose a memory model in the extension settings.", detail: null,
    needsSetup: true, nextAction: "repair" } }) },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(canvasElement.querySelector("#so-hud-card-settings") as HTMLElement);
    await expect(args.onOpenSettings).toHaveBeenCalledTimes(1);
  },
};

export const AuthorLevelPicker: Story = {
  args: { snapshot: snapshot({ ui: { authorView: true, inline: { level: 3 } } }) },
  play: async ({ args, canvasElement }) => {
    const picker = canvasElement.querySelector("#so-hud-card-level") as HTMLElement;
    await expect(within(picker).getByRole("radio", { name: "Author" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(picker).getByRole("radio", { name: "Raw" }));
    await expect(args.setLevel).toHaveBeenCalledWith(4);
  },
};

export const NoTabs: Story = {
  args: { tabs: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="hud-card-tab"]')).toBeNull();
    await expect(within(canvasElement).getByRole("button", { name: "Story window" })).toBeVisible();
  },
};

const card = (canvasElement: HTMLElement) => canvasElement.querySelector("#so-hud-card");

export const Phone: Story = fitsAt(VIEWPORTS.phone, card);
export const AuthorPhone: Story = { args: { snapshot: snapshot({ ui: { authorView: true, inline: { level: 2 } } }) }, ...fitsAt(VIEWPORTS.phone, card) };
