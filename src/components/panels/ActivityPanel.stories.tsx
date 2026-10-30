import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { ActivityRow } from "@runtime/activityFeed";
import { ActivityPanel } from "./ActivityPanel";
import { PanelFrame } from "./PanelFrame";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const ROWS: ActivityRow[] = [
  { id: "roll:quality:lock_gives:4:6:9", messageId: 6, category: "rolls", text: "lock_gives: d20 9 vs 12, success" },
  { id: "progress:transition:4", messageId: 6, category: "progress", text: "The Ruins: find the sealed door" },
  { id: "progress:gate:4", messageId: 6, category: "progress", text: "gate → ruins (gate)", detail: "gate: {\"q\":\"found_map\"}" },
  { id: "memory:fact:f1", messageId: 4, category: "memory", text: "Remembered: The map points east.", state: "pending" },
  { id: "roll:talk:talk:3:4:57", messageId: 4, category: "rolls", text: "talk: d100 57" },
];

const meta: Meta<typeof ActivityPanel> = {
  title: "Panels/ActivityPanel",
  component: ActivityPanel,
  args: { rows: ROWS, onJump: fn() },
};

export default meta;

type Story = StoryObj<typeof ActivityPanel>;

export const AuthorFeed: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-so="activity-row"]')).toHaveLength(5);
    await userEvent.click(canvas.getByRole("button", { name: /^Rolls/ }));
    await expect(canvasElement.querySelectorAll('[data-so="activity-row"]')).toHaveLength(2);
    await userEvent.click(canvas.getAllByRole("button", { name: "Go to message 6" })[0]);
    await expect(args.onJump).toHaveBeenCalledWith(6);
  },
};

export const WithSetupFindings: Story = {
  args: { setupCount: 2, onOpenHealth: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="activity-checks"]')?.textContent).toContain("2 setup checks need attention.");
    await userEvent.click(canvas.getByRole("button", { name: "Open Health" }));
    await expect(args.onOpenHealth).toHaveBeenCalled();
    await expect(canvasElement.querySelectorAll('[data-so="activity-row"]')).toHaveLength(5);
  },
};

const filter = (canvasElement: HTMLElement) => within(canvasElement).getByRole("group", { name: "Show" });

export const Phone: Story = fitsAt(VIEWPORTS.phone, filter);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, filter);
export const Wide: Story = fitsAt(VIEWPORTS.wide, filter);

export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="activity-empty"]')).not.toBeNull();
  },
};

export const InTheFrame: Story = {
  render: (args) => (
    <PanelFrame id="activity" title="Activity" geometry={{ x: 20, y: 20, w: 420, h: 360 }} viewport={{ width: 1440, height: 900 }} onChange={fn()} onClose={fn()}>
      <ActivityPanel {...args} />
    </PanelFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-panel-activity #so-activity")).not.toBeNull();
  },
};
