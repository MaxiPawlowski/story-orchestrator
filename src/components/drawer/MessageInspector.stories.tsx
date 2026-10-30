import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { InlineView } from "@runtime/inlineTimeline";
import { PanelFrame } from "../panels/PanelFrame";
import { MessageInspector } from "./MessageInspector";

const view = (level: 3 | 4): InlineView => ({
  level,
  requested: level,
  window: 20,
  categories: {},
  newestMessageId: 6,
  byMessage: {
    2: [{ id: "memory:fact:f0", category: "memory", level: 2, persona: "player", state: "applied", text: "Remembered: the gate is sealed." }],
    4: [
      { id: "progress:gate:3", category: "progress", level: 3, persona: "author", state: "applied", text: "cp1 → cp2 (gate)", detail: "found_map: false → true" },
      { id: "lore:count:4", category: "lore", level: 2, until: 3, persona: "player", state: "applied", text: "Lore consulted: 1 entry" },
      { id: "lore:entry:4:Sun:2", category: "lore", level: 3, persona: "author", state: "applied", text: "Sun Ruins · Gate", detail: "key · uid 2" },
      { id: "health:effect:x", category: "health", level: 3, persona: "author", state: "refused", text: "background failed" },
      { id: "calls:payload:x", category: "calls", level: 4, persona: "author", state: "applied", text: "3 story blocks injected", detail: "so_memory_facts@4" },
    ],
  },
  boundaries: {
    4: [{
      boundary: 3, messageId: 4, source: "gate", fired: { from: "cp1", to: "cp2", fromName: "The Market", toName: "The Confession" }, stayedAt: null,
      changes: [{ key: "found_map", label: "Found the map", before: "false", after: "true", by: "read" }, { key: "story_time", label: "story_time", before: "0", after: "1", by: "engine" }],
      gates: [{ to: "cp2", toName: "The Confession", raw: "found_map == true", met: true, leaves: [{ key: "found_map", label: "Found the map", op: "=", want: "true", now: "true", met: true }] }],
      discarded: 0,
    }],
    6: [{
      boundary: 4, messageId: 6, source: "gate", fired: null, stayedAt: { id: "cp2", name: "The Confession" }, changes: [],
      gates: [{ to: "cp3", toName: "The Vault", raw: "trust >= 2", met: false, leaves: [{ key: "trust", label: "Guide's trust", op: "≥", want: "2", now: "0", met: false }] }],
      discarded: 1,
    }],
  },
  prompts: { 4: { reason: "generation", blocks: [{ key: "story_orchestrator_memory_facts", depth: 4, chars: 820 }, { key: "story_orchestrator_pacing", depth: 2, chars: 200 }] } },
});

const meta: Meta<typeof MessageInspector> = {
  title: "Drawer/MessageInspector",
  component: MessageInspector,
};

export default meta;

type Story = StoryObj<typeof MessageInspector>;

export const WhatChangedAndWhy: Story = {
  args: { view: view(3), messageId: 4, onStep: fn(), onOpenAuthor: fn(), actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const sections = [...canvasElement.querySelectorAll('[data-so="inspector-section"]')].map((node) => node.getAttribute("data-category"));
    await expect(sections).toEqual(["changed", "why", "prompt", "health", "progress", "lore"]);
    await expect(canvas.getByRole("heading", { name: /Message 4\s*· boundary 3/ })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="inspector-change"][data-key="found_map"]')?.textContent).toContain("false → true");
    await expect(canvas.getByText(/Moved The Market → The Confession: Found the map = true, now true/)).toBeInTheDocument();
    await expect(canvas.getByText(/2 blocks · 1,020 chars/)).toBeInTheDocument();
    await expect(canvas.queryByText("so_memory_facts@4")).toBeNull();
    await expect(canvasElement.textContent).not.toContain("Lore consulted");
    await userEvent.click(canvas.getByRole("button", { name: "Open in Author page" }));
    await expect(args.onOpenAuthor).toHaveBeenCalled();
  },
};

export const StayedWithUnmetGates: Story = {
  args: { view: view(3), messageId: 6, onStep: fn() },
  play: async ({ canvasElement }) => {
    const why = canvasElement.querySelector('[data-so="inspector-why"]');
    await expect(why?.getAttribute("data-fired")).toBe("false");
    await expect(why?.textContent).toContain("Stayed at The Confession");
    await expect(why?.textContent).toContain("→ The Vault: Guide's trust ≥ 2, now 0");
    await expect(why?.textContent).toContain("1 queued write was discarded");
  },
};

export const StepsBetweenMessages: Story = {
  args: { view: view(3), messageId: 4, onStep: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Previous message" }));
    await expect(args.onStep).toHaveBeenCalledWith(2);
    await userEvent.click(canvas.getByRole("button", { name: "Next message" }));
    await expect(args.onStep).toHaveBeenCalledWith(6);
  },
};

export const RawOnlyAtLevelFour: Story = {
  args: { view: view(4), messageId: 4, onStep: fn() },
  play: async ({ canvasElement }) => {
    const raw = canvasElement.querySelector('[data-so="inspector-section"][data-category="raw"]');
    await expect(raw).not.toBeNull();
    await expect(raw?.textContent).toContain("so_memory_facts@4");
  },
};

export const NothingRecorded: Story = {
  args: { view: view(3), messageId: 0, onStep: fn() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="inspector-empty"]')).not.toBeNull();
    await expect(within(canvasElement).getByRole("button", { name: "Previous message" })).toBeDisabled();
  },
};

export const AsAFloatingPanel: Story = {
  args: { view: view(3), messageId: 4, onStep: fn(), onOpenAuthor: fn() },
  render: (args) => (
    <PanelFrame id="inspector" title="Inspector" geometry={{ x: 900, y: 40, w: 400, h: 560 }} viewport={{ width: 1440, height: 900 }} onChange={fn()} onClose={fn()}>
      <MessageInspector {...args} />
    </PanelFrame>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-panel-inspector #so-inspector")).not.toBeNull();
  },
};
