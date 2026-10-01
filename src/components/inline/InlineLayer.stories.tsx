import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { InlineItem, InlineView } from "@runtime/inlineTimeline";
import type { InlineLevel } from "@runtime/settingsModel";
import { InlineLayer, type InlineHostPort } from "./InlineLayer";

const item = (fields: Partial<InlineItem> & Pick<InlineItem, "id" | "category" | "level" | "text">): InlineItem => ({
  persona: fields.level <= 2 ? "player" : "author",
  state: "applied",
  ...fields,
});

const view = (level: InlineLevel): InlineView => ({
  level,
  requested: level,
  window: 20,
  categories: {},
  newestMessageId: 5,
  byMessage: {
    2: [item({ id: "progress:transition:2", category: "progress", level: 1, text: "The Ruins: find the sealed door" })],
    5: [
      item({ id: "memory:fact:f1", category: "memory", level: 1, text: "Remembered: The map points east." }),
      item({ id: "progress:gate:5", category: "progress", level: 3, text: "cp1 → cp2 (gate)" }),
    ],
    7: [item({ id: "lore:entry:7", category: "lore", level: 3, text: "Sun Ruins · CP4" })],
  },
});

const hostPort: InlineHostPort = {
  sync: (messageIds) => new Map(messageIds.flatMap((messageId) => {
    const host = document.getElementById(`so-story-mes-${messageId}`);
    return host ? [[messageId, host] as const] : [];
  })),
  onRebuild: () => () => {},
};

const Chat = ({ view: current, actions }: { view: InlineView; actions: { run: () => void; inspect: () => void } }) => (
  <div>
    {[2, 5].map((messageId) => (
      <div key={messageId} className="mes" data-mesid={messageId}>
        <div className="mes_text">Message {messageId}</div>
        <div id={`so-story-mes-${messageId}`} data-so="test-host" />
      </div>
    ))}
    <InlineLayer view={current} hosts={hostPort} actions={actions} />
  </div>
);

const meta: Meta<typeof Chat> = {
  title: "Inline/InlineLayer",
  component: Chat,
};

export default meta;

type Story = StoryObj<typeof Chat>;

const hostChips = (canvasElement: HTMLElement, messageId: number) =>
  [...canvasElement.querySelectorAll(`#so-story-mes-${messageId} [data-so="inline-chip"]`)].map((chip) => chip.getAttribute("data-category"));

export const PlayerChipsLandUnderTheirMessage: Story = {
  args: { view: view(1), actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(hostChips(canvasElement, 2)).toEqual(["progress"]);
    await expect(hostChips(canvasElement, 5)).toEqual(["memory"]);
    await expect(canvasElement.textContent).not.toContain("cp1");
    await expect(canvasElement.textContent).not.toContain("Sun Ruins");
    await userEvent.click(within(canvasElement.querySelector("#so-story-mes-5") as HTMLElement).getByRole("button", { name: "Memory: 1" }));
    await expect(canvas.getByText("Remembered: The map points east.")).toBeInTheDocument();
  },
};

export const AuthorLevelAddsChipsAndSkipsMissingHosts: Story = {
  args: { view: view(3), actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    await expect(hostChips(canvasElement, 5)).toEqual(["progress", "memory"]);
    await expect(canvasElement.querySelectorAll('[data-so="inline-chip"][data-category="lore"]')).toHaveLength(0);
  },
};

export const OffRendersNothing: Story = {
  args: { view: view(0), actions: { run: fn(), inspect: fn() } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-so="inline-chip"]')).toHaveLength(0);
  },
};
