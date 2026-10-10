import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { WidgetCard } from "./WidgetCard";
import { boardWidget, clockWidget, cluesWidget, mapWidget, sampleGame } from "./gameViewFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof WidgetCard> = {
  title: "Panels/WidgetCard",
  component: WidgetCard,
  args: { widget: sampleGame().journal[0] },
};

export default meta;

type Story = StoryObj<typeof WidgetCard>;

export const Track: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("The ferryman's debt")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="quest"]')).toHaveLength(3);
  },
};

export const Clock: Story = {
  args: { widget: clockWidget },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("img", { name: "Alarm: 4 of 6" })).toBeVisible();
  },
};

export const Board: Story = {
  args: { widget: boardWidget },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-so="board-lane"]')).toHaveLength(3);
  },
};

export const Meters: Story = { args: { widget: sampleGame().statSheet ?? clockWidget } };

export const Clues: Story = {
  args: { widget: cluesWidget, onAction: fn(() => ({ ok: true as const })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-so="clue"]')).toHaveLength(3);
    await expect(canvasElement.querySelectorAll('[data-so="clue"][data-fresh="true"]')).toHaveLength(1);
    await expect(canvas.getByRole("list", { name: "Connections" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "I show the ledger page to the ferryman." }));
    await expect(args.onAction).toHaveBeenCalledWith("I show the ledger page to the ferryman.");
    await expect(canvasElement.querySelector('[data-so="widget-action-refused"]')).toBeNull();
  },
};

export const ClueActionRefused: Story = {
  args: { widget: cluesWidget, onAction: fn(() => ({ ok: false as const, reason: "You started typing, so it was not put in." })) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "I show the ledger page to the ferryman." }));
    await expect(await within(canvasElement).findByRole("status")).toHaveTextContent("You started typing");
  },
};

export const CluesReadOnly: Story = {
  args: { widget: cluesWidget },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="widget-action"]')).toBeNull();
  },
};

export const MapPins: Story = {
  args: { widget: mapWidget, onAction: fn(() => ({ ok: true as const })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const places = canvas.getByRole("list", { name: "Places on the map" });
    await expect(within(places).getAllByRole("listitem")).toHaveLength(2);
    await expect(canvasElement.querySelector('[data-so="map-pin"][data-here="true"]')).toHaveTextContent("The boathouse");
    await userEvent.click(canvas.getByRole("button", { name: "I head for the boathouse." }));
    await expect(args.onAction).toHaveBeenCalledWith("I head for the boathouse.");
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="widget"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
export const MapPhone: Story = { args: { widget: mapWidget }, ...fitsAt(VIEWPORTS.phone, primary) };
export const CluesPhone: Story = { args: { widget: cluesWidget }, ...fitsAt(VIEWPORTS.phone, primary) };
