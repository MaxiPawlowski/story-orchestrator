import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { WidgetCard } from "./WidgetCard";
import {
  boardWidget, clockWidget, cluesWidget, intentsWidget, mapWidget, provenanceRows, rosterWidget, sampleGame, stillWidget, timelineWidget,
} from "./gameViewFixtures";
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
  parameters: { actions: { disable: true } },
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

export const Roster: Story = {
  args: { widget: rosterWidget, onOpen: fn(() => ({ ok: true as const })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-so="roster-row"]')).toHaveLength(3);
    await expect(canvas.getByText("just changed")).toBeVisible();
    await expect(canvas.getByText("changed 3 replies ago")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "What do I know about them?" }));
    await expect(args.onOpen).toHaveBeenCalledWith("memory");
  },
};

export const Timeline: Story = {
  args: { widget: timelineWidget },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-so="timeline-chapter"]')).toHaveLength(2);
    await expect(canvasElement.querySelector('[data-so="timeline-stop"][data-here="true"]')).toHaveTextContent("The boathouse");
    await expect(within(canvasElement).getByText(/Day 3/)).toBeVisible();
  },
};

export const Intents: Story = {
  args: { widget: intentsWidget, onAction: fn(() => ({ ok: true as const })), onOpen: fn(() => ({ ok: true as const })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("changed 1 reply ago")).toBeVisible();
    await expect(canvas.getByText("Climb: d20 vs 12")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "I try to climb the wall." }));
    await expect(args.onAction).toHaveBeenCalledWith("I try to climb the wall.");
    await userEvent.click(canvas.getByRole("button", { name: "Back to the story" }));
    await expect(args.onOpen).toHaveBeenCalledWith("overview");
  },
};

export const IntentsWithoutHost: Story = {
  args: { widget: intentsWidget },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="widget-intents"]')).toBeNull();
  },
};

export const AuthorProvenance: Story = {
  args: { widget: sampleGame().statSheet ?? clockWidget, provenance: provenanceRows },
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "Where these values came from" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    await expect(list).toHaveTextContent("Resolve (resolve): set by the reader at message #8, boundary 4");
    await expect(list).toHaveTextContent("Coins (coins): unchanged in the turns this chat keeps");
  },
};

export const MotionOff: Story = {
  args: { widget: stillWidget },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="widget"]')).toHaveAttribute("data-motion", "off");
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="widget"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
export const MapPhone: Story = { args: { widget: mapWidget }, ...fitsAt(VIEWPORTS.phone, primary) };
export const CluesPhone: Story = { args: { widget: cluesWidget }, ...fitsAt(VIEWPORTS.phone, primary) };
export const RosterPhone: Story = { args: { widget: rosterWidget }, ...fitsAt(VIEWPORTS.phone, primary) };
export const TimelinePhone: Story = { args: { widget: timelineWidget }, ...fitsAt(VIEWPORTS.phone, primary) };
export const IntentsPhone: Story = { args: { widget: intentsWidget, onAction: fn(() => ({ ok: true as const })) }, ...fitsAt(VIEWPORTS.phone, primary) };
