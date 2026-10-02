import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { InlineView } from "@runtime/inlineTimeline";
import { MessageInspector } from "./MessageInspector";

const view: InlineView = {
  level: 3,
  requested: 3,
  window: 20,
  categories: {},
  newestMessageId: 6,
  byMessage: {
    4: [
      { id: "progress:gate:3", category: "progress", level: 3, persona: "author", state: "applied", text: "cp1 → cp2 (gate)", detail: "found_map: false → true" },
      { id: "lore:count:4", category: "lore", level: 2, until: 3, persona: "player", state: "applied", text: "Lore consulted: 1 entry" },
      { id: "lore:entry:4:Sun:2", category: "lore", level: 3, persona: "author", state: "applied", text: "Sun Ruins · Gate", detail: "key · uid 2" },
      { id: "calls:payload:x", category: "calls", level: 4, persona: "author", state: "applied", text: "3 story blocks injected", detail: "so_memory_facts@4" },
    ],
  },
};

const meta: Meta<typeof MessageInspector> = {
  title: "Drawer/MessageInspector",
  component: MessageInspector,
};

export default meta;

type Story = StoryObj<typeof MessageInspector>;

export const SectionsForOneMessage: Story = {
  args: { view, messageId: 4, onClose: fn(), actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const sections = [...canvasElement.querySelectorAll('[data-so="inspector-section"]')].map((node) => node.getAttribute("data-category"));
    await expect(sections).toEqual(["progress", "lore", "calls"]);
    await expect(canvas.getByText("so_memory_facts@4")).toBeInTheDocument();
    await expect(canvasElement.textContent).not.toContain("Lore consulted");
    await userEvent.click(canvas.getByRole("button", { name: "Close the inspector" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const NothingRecorded: Story = {
  args: { view, messageId: 5, onClose: fn() },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="inspector-empty"]')).not.toBeNull();
  },
};

export const OpensInViewInAScrolledDrawer: Story = {
  args: { view, messageId: 4, onClose: fn() },
  render: (args) => (
    <div data-so="scroller" ref={(node) => { if (node) node.scrollTop = 3000; }} style={{ height: 200, overflowY: "auto" }}>
      <MessageInspector {...args} />
      <div style={{ height: 4000 }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const inspector = canvasElement.querySelector("#so-inspector") as HTMLElement;
    await expect(document.activeElement).toBe(inspector);
    const scroller = canvasElement.querySelector('[data-so="scroller"]') as HTMLElement;
    await expect(Math.abs(inspector.getBoundingClientRect().top - scroller.getBoundingClientRect().top)).toBeLessThan(2);
  },
};
