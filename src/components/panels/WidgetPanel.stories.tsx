import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { WidgetPanel } from "./WidgetPanel";
import { boardWidget, clockWidget, cluesWidget, mapWidget } from "../widgets/gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof WidgetPanel> = {
  title: "Panels/WidgetPanel",
  component: WidgetPanel,
  args: { widget: clockWidget },
};

export default meta;

type Story = StoryObj<typeof WidgetPanel>;

export const ClockPanel: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-widget-alarm-clock")).not.toBeNull();
    await expect(within(canvasElement).getByRole("img", { name: "Alarm: 4 of 6" })).toBeVisible();
  },
};

export const BoardPanel: Story = { args: { widget: boardWidget } };

export const CluesPanel: Story = {
  args: { widget: cluesWidget, onAction: fn(() => ({ ok: true as const })) },
  play: async ({ canvasElement, args }) => {
    await expect(canvasElement.querySelector("#so-widget-clue-wall")).not.toBeNull();
    await userEvent.click(within(canvasElement).getByRole("button", { name: "I show the ledger page to the ferryman." }));
    await expect(args.onAction).toHaveBeenCalledTimes(1);
  },
};

export const MapPanel: Story = {
  args: { widget: mapWidget },
  parameters: { actions: { disable: true } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-widget-river-map [data-so='map']")).not.toBeNull();
    await expect(canvasElement.querySelector('[data-so="widget-action"]')).toBeNull();
  },
};

const htmlWidget = {
  id: "case-board", title: "Case board", audience: "player" as const, synthesized: false,
  body: { kind: "html" as const, template: "<p>board</p>", actions: [], source: cluesWidget },
};

export const HtmlPanelFramed: Story = {
  args: { widget: htmlWidget, html: { journal: fn() } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('#so-widget-case-board iframe[data-so="html-widget"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-so="html-fallback"]')).toBeNull();
  },
};

export const HtmlPanelOffShowsPlainPanel: Story = {
  args: { widget: htmlWidget, html: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="html-widget"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="html-fallback"] [data-so="clue"]')).not.toBeNull();
  },
};

const primary =(canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="widget-panel"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
export const MapPhone: Story = { args: { widget: mapWidget }, ...fitsAt(VIEWPORTS.phone, primary) };
