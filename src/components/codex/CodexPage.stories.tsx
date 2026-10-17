import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { CodexPage } from "./CodexPage";
import { JournalPanel } from "../panels/JournalPanel";
import { codexGame, labelledPeople, returnPlaces, sampleCodex } from "./codexFixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof CodexPage> = {
  title: "Panels/CodexPage",
  component: CodexPage,
  args: { page: "people", entries: sampleCodex().people },
};

export default meta;

type Story = StoryObj<typeof CodexPage>;

export const People: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The ferryman")).toBeVisible();
    await expect(canvas.getByText("From The innkeeper")).toBeVisible();
    await expect(canvas.getByText("2 people")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="codex-fresh"]').length).toBe(1);
  },
};

export const Places: Story = {
  args: { page: "places", entries: sampleCodex().places },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("1 place")).toBeVisible();
    await expect(within(canvasElement).getByText("The back door does not lock.")).toBeVisible();
  },
};

export const RelationshipLabels: Story = {
  args: { page: "people", entries: labelledPeople() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Toward you: wary")).toBeVisible();
    await expect(canvas.getByText("Learned: secretly loyal to you")).toBeVisible();
    await expect(canvas.getByText("Toward Tom: rivals")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="codex-row"][data-kind="learned"][data-fresh="true"]').length).toBe(1);
    await expect(canvasElement.textContent ?? "").not.toMatch(/\d+ (on|of) /);
  },
};

export const ReturnVisits: Story = {
  args: { page: "places", entries: returnPlaces() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("The back door still hangs off one hinge.")).toBeVisible();
    await expect(canvas.getByText("Someone has mended the cut nets.")).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="codex-row"][data-kind="return"]').length).toBe(2);
    await expect(canvasElement.querySelectorAll('[data-so="codex-row"][data-kind="return"][data-fresh="true"]').length).toBe(1);
  },
};

export const EmptyPage: Story = {
  args: { entries: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="codex-people"]')).toBeNull();
  },
};

export const InJournal: StoryObj<typeof JournalPanel> = {
  render: () => <JournalPanel game={codexGame()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("tab", { name: "People · 2" })).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "People · 2" }));
    await expect(canvas.getByText("Runs the night crossing.")).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Places · 1" }));
    await expect(canvas.getByText("The boathouse")).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Journal" }));
    await expect(canvas.getByText("The ferryman's debt")).toBeVisible();
  },
};

export const OnlyPeople: StoryObj<typeof JournalPanel> = {
  render: () => <JournalPanel game={codexGame({ people: sampleCodex().people, places: [] })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab", { name: /Places/ })).toBeNull();
    await expect(canvas.getByRole("tab", { name: "People · 2" })).toBeVisible();
  },
};

export const NoCodexNoTabs: StoryObj<typeof JournalPanel> = {
  render: () => <JournalPanel game={codexGame(null)} />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="journal-tabs"]')).toBeNull();
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="codex-people"]');

export const Phone: Story = fitsAt(VIEWPORTS.phone, primary);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, primary);
export const Wide: Story = fitsAt(VIEWPORTS.wide, primary);
