import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { InlineItem } from "@runtime/inlineTimeline";
import type { InlineCategory, InlineLevel } from "@runtime/settingsModel";
import { InlineStrip } from "./InlineStrip";
import type { InlineActions } from "./InlineDetail";

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

const Harness = ({ level, actions, legend }: { level: InlineLevel; actions?: InlineActions; legend?: boolean }) => {
  const [expanded, setExpanded] = useState<InlineCategory | null>(null);
  const toggle = (category: InlineCategory) => setExpanded((current) => (current === category ? null : category));
  return <InlineStrip messageId={4} items={visible(level)} level={level} expanded={expanded} onToggle={toggle} actions={actions} legend={legend} />;
};

const meta: Meta<typeof Harness> = {
  title: "Inline/InlineStrip",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

export const PlayerStoryLevel: Story = {
  args: { level: 1, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chips = [...canvasElement.querySelectorAll('[data-so="inline-chip"]')].map((chip) => chip.getAttribute("data-category"));
    await expect(chips).toEqual(["progress", "memory"]);
    await expect(canvasElement.querySelector('[data-so="inline-inspect"]')).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Memory: 1" }));
    await expect(canvas.getByText("Remembered: The map points east.")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="inline-item-detail"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="inline-action"]')).toBeNull();
    await expect(canvasElement.textContent).not.toContain("cp1");
    await userEvent.click(canvas.getByRole("button", { name: "Memory: 1" }));
    await expect(canvasElement.querySelector('[data-so="inline-expanded"]')).toBeNull();
  },
};

export const BehindTheScenesShowsLoreCountsOnly: Story = {
  args: { level: 2, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "World Info: 1" }));
    await expect(canvas.getByText("Lore consulted: 4 entries")).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain("Betrayal");
  },
};

export const AuthorLevelShowsDetailActionsAndInspect: Story = {
  args: { level: 3, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Memory: 2" }));
    await expect(canvas.getByText("found_map = true")).toBeInTheDocument();
    await expect(canvas.getByText("\"I unroll the map.\"")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Pin" }));
    await expect(args.actions?.run).toHaveBeenCalledWith({ kind: "pin-fact", id: "f1", pinned: true });
    await userEvent.click(canvas.getByRole("button", { name: "Inspect message 4" }));
    await expect(args.actions?.inspect).toHaveBeenCalledWith(4);
    await userEvent.click(canvas.getByRole("button", { name: "World Info: 1" }));
    await expect(canvas.getByText("Sun Ruins · CP4 - Betrayal reveal")).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain("Lore consulted");
  },
};

export const RawLevelKeepsRawDetailInTheInspector: Story = {
  args: { level: 4, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Progress: 3" }));
    await expect(canvas.getByText("Boundary 3 evaluated")).toBeInTheDocument();
    await expect(canvas.getByText("gate: {\"all\":[\"found_map\"]}")).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain("blackboard");
  },
};

export const LegendOpensBelowTheChipRow: Story = {
  args: { level: 1, legend: true, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Memory: 1" }));
    await userEvent.click(canvas.getByRole("button", { name: "What do these icons mean?" }));
    const legend = canvasElement.querySelector('[data-so="inline-legend"]');
    await expect(legend).not.toBeNull();
    await expect(legend?.closest(".so-inline-chips")).toBeNull();
    await expect(legend?.parentElement?.getAttribute("data-so")).toBe("inline-strip");
    await expect(canvasElement.querySelector('[data-so="inline-expanded"]')).not.toBeNull();
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
  const [expanded, setExpanded] = useState<InlineCategory | null>("progress");
  const items = [ITEMS[0], SCENE_TEST].filter((entry) => entry.level <= level);
  return <InlineStrip messageId={4} items={items} level={level} expanded={expanded} onToggle={(category) => setExpanded((current) => (current === category ? null : category))} />;
};

export const SceneTestChipIsAuthorOnly: Story = {
  render: () => <div><div data-level="2"><SceneHarness level={2} /></div><div data-level="3"><SceneHarness level={3} /></div></div>,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-level="2"]')?.textContent).not.toContain("Scene test");
    await expect(canvasElement.querySelector('[data-level="3"]')).toHaveTextContent("Scene test: interrupt");
    await expect(canvasElement.querySelector('[data-level="3"]')).toHaveTextContent("chaos 2 of 4");
  },
};
