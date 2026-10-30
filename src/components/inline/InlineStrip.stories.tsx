import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { InlineItem } from "@runtime/inlineTimeline";
import type { InlineLevel } from "@runtime/settingsModel";
import { InlineStrip } from "./InlineStrip";
import type { InlineActions } from "./InlineDetail";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const item = (fields: Partial<InlineItem> & Pick<InlineItem, "id" | "category" | "level" | "text">): InlineItem => ({
  persona: fields.level <= 2 ? "player" : "author",
  state: "applied",
  ...fields,
});

const ITEMS: InlineItem[] = [
  item({ id: "progress:transition:3", category: "progress", level: 1, text: "The Ruins: find the sealed door" }),
  item({ id: "progress:gate:3", category: "progress", level: 3, text: "cp1 → cp2 (gate)", detail: "gate: {\"all\":[\"found_map\"]}" }),
  item({
    id: "memory:fact:f1", category: "memory", level: 1, text: "Remembered: The map points east.", detail: "\"It points east.\"",
    actions: [{ kind: "pin-fact", id: "f1", pinned: true }, { kind: "exclude-fact", id: "f1" }],
  }),
  item({ id: "memory:delta:a1:0", category: "memory", level: 3, state: "pending", text: "found_map = true", detail: "\"I unroll the map.\"" }),
  item({ id: "lore:count:4", category: "lore", level: 2, until: 3, text: "Lore consulted: 4 entries" }),
  item({ id: "lore:entry:4:Sun:2", category: "lore", level: 3, text: "Sun Ruins · CP4 - Betrayal reveal", detail: "constant · checkpoint-gated · uid 2" }),
  item({ id: "progress:evaluated:3", category: "progress", level: 4, text: "Boundary 3 evaluated", detail: "{\"blackboard\":{\"found_map\":true}}" }),
];

const visible = (level: InlineLevel) => ITEMS.filter((entry) => entry.level <= level && (entry.until === undefined || level < entry.until));

const Harness = ({ level, actions, open = false }: { level: InlineLevel; actions?: InlineActions; open?: boolean }) => {
  const [expanded, setExpanded] = useState(open);
  return <InlineStrip messageId={4} items={visible(level)} level={level} expanded={expanded} onToggle={() => setExpanded((current) => !current)} actions={actions} />;
};

const meta: Meta<typeof Harness> = {
  title: "Inline/InlineStrip",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

const line = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="inline-line"]') as HTMLElement;
const parts = (canvasElement: HTMLElement) => [...canvasElement.querySelectorAll('[data-so="inline-part"]')].map((part) => part.getAttribute("data-category"));

export const PlayerStoryLevel: Story = {
  args: { level: 1, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    await expect(parts(canvasElement)).toEqual(["progress", "memory"]);
    await expect(line(canvasElement)).toHaveTextContent("The story moved on·Remembered 1 thing");
    await expect(canvasElement.querySelector('[data-so="inline-part"][data-category="memory"]')?.getAttribute("title")).toBe("Memory");
    await expect(canvasElement.querySelector('[data-so="inline-inspect"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="inline-raw-count"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="inline-legend-toggle"]')).toBeNull();
    await userEvent.click(line(canvasElement));
    await expect(line(canvasElement)).toHaveAttribute("aria-expanded", "true");
    await expect(within(canvasElement).getByText("Remembered: The map points east.")).toBeInTheDocument();
    await expect(within(canvasElement).getByText("The Ruins: find the sealed door")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="inline-item-detail"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="inline-action"]')).toBeNull();
    await expect(canvasElement.textContent).not.toContain("cp1");
    await userEvent.click(line(canvasElement));
    await expect(canvasElement.querySelector('[data-so="inline-expanded"]')).toBeNull();
  },
};

export const PlayerLineExpanded: Story = {
  args: { level: 1, open: true },
  play: async ({ canvasElement }) => {
    const groups = [...canvasElement.querySelectorAll('[data-so="inline-expanded"] [data-so="inline-group"]')].map((group) => group.getAttribute("data-category"));
    await expect(groups).toEqual(["progress", "memory"]);
  },
};

export const BehindTheScenesShowsLoreCountsOnly: Story = {
  args: { level: 2, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    await expect(line(canvasElement)).toHaveTextContent("Lore used");
    await userEvent.click(line(canvasElement));
    await expect(within(canvasElement).getByText("Lore consulted: 4 entries")).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain("Betrayal");
  },
};

export const AuthorLevelShowsDetailActionsAndInspect: Story = {
  args: { level: 3, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(line(canvasElement)).toHaveTextContent("Remembered 2 things");
    await expect(canvasElement.querySelector('[data-so="inline-raw-count"]')).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Inspect message 4" }));
    await expect(args.actions?.inspect).toHaveBeenCalledWith(4);
    await userEvent.click(line(canvasElement));
    await expect(canvas.getByText("found_map = true")).toBeInTheDocument();
    await expect(canvas.getByText("\"I unroll the map.\"")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Pin" }));
    await expect(args.actions?.run).toHaveBeenCalledWith({ kind: "pin-fact", id: "f1", pinned: true });
    await expect(canvas.getByText("Sun Ruins · CP4 - Betrayal reveal")).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain("Lore consulted");
  },
};

export const RawLevelAddsCountsAndKeepsRawDetailInTheInspector: Story = {
  args: { level: 4, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="inline-part"][data-category="progress"] [data-so="inline-raw-count"]')).toHaveTextContent("3 raw");
    await userEvent.click(line(canvasElement));
    await expect(canvas.getByText("Boundary 3 evaluated")).toBeInTheDocument();
    await expect(canvas.getByText("gate: {\"all\":[\"found_map\"]}")).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain("blackboard");
  },
};

export const OffRendersNothing: Story = {
  args: { level: 0 },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="inline-strip"]')).toBeNull();
  },
};

const SCENE_TEST = item({
  id: "progress:scene-test:liv_1:4", category: "progress", level: 3, text: "Scene test: interrupt",
  detail: "chaos 2 of 4, odds 0.43; drawn interrupt; focus: who is cutting the lantern wicks; after The Cold Quay",
});

const SceneHarness = ({ level }: { level: InlineLevel }) => {
  const [expanded, setExpanded] = useState(true);
  const items = [ITEMS[0], SCENE_TEST].filter((entry) => entry.level <= level);
  return <InlineStrip messageId={4} items={items} level={level} expanded={expanded} onToggle={() => setExpanded((current) => !current)} />;
};

export const SceneTestChipIsAuthorOnly: Story = {
  render: () => <div><div data-level="2"><SceneHarness level={2} /></div><div data-level="3"><SceneHarness level={3} /></div></div>,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-level="2"]')?.textContent).not.toContain("Scene test");
    await expect(canvasElement.querySelector('[data-level="3"]')).toHaveTextContent("Scene test: interrupt");
    await expect(canvasElement.querySelector('[data-level="3"]')).toHaveTextContent("chaos 2 of 4");
  },
};

const openLine = async (canvasElement: HTMLElement) => {
  await userEvent.click(line(canvasElement));
  return canvasElement.querySelector('[data-so="inline-strip"]');
};

export const Phone: Story = { ...fitsAt(VIEWPORTS.phone, openLine), args: { level: 3, actions: { run: fn(), inspect: fn() } } };
