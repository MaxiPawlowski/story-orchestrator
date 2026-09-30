import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { InlineItem } from "@runtime/inlineTimeline";
import { InlineDetail } from "./InlineDetail";

const ITEMS: InlineItem[] = [
  { id: "a", category: "calls", level: 2, persona: "player", state: "live", text: "Reading the last 3 messages…" },
  { id: "b", category: "calls", level: 2, persona: "player", state: "pending", text: "2 things noted, apply next turn", detail: "cadence · messages 3–5" },
  { id: "c", category: "lore", level: 3, persona: "author", state: "pending", text: "Switch on Sun Ruins · Gate",
    actions: [{ kind: "curator-op", proposalId: "p1", index: 0, decision: "accepted" }, { kind: "curator-op", proposalId: "p1", index: 0, decision: "rejected" }] },
  { id: "d", category: "memory", level: 3, persona: "author", state: "refused", text: "Rejected: DELTA gate_open=maybe", detail: "value not in enum" },
];

const meta: Meta<typeof InlineDetail> = {
  title: "Inline/InlineDetail",
  component: InlineDetail,
};

export default meta;

type Story = StoryObj<typeof InlineDetail>;

export const StatesAndActions: Story = {
  args: { items: ITEMS, showDetail: true, showActions: true, actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const states = [...canvasElement.querySelectorAll('[data-so="inline-item"]')].map((row) => row.getAttribute("data-state"));
    await expect(states).toEqual(["live", "pending", "pending", "refused"]);
    await expect(canvas.getByText("value not in enum")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Decline" }));
    await expect(args.actions?.run).toHaveBeenCalledWith({ kind: "curator-op", proposalId: "p1", index: 0, decision: "rejected" });
  },
};

export const PlayerHidesDetailAndActions: Story = {
  args: { items: ITEMS.slice(0, 2), showDetail: false, showActions: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="inline-item-detail"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="inline-action"]')).toBeNull();
    await expect(canvasElement.textContent).not.toContain("cadence");
  },
};
