import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, waitFor } from "@storybook/test";
import type { InChatView } from "@runtime/inChatTypes";
import { InChatLayer, type InChatHostPort, type InChatSlot } from "./InChatLayer";

const VIEW: InChatView = {
  player: true,
  author: true,
  dividers: { 2: { time: "Day 1, evening", scene: true } },
  because: { 2: ["Reached The Yard, because you set the watch."] },
  discovery: { 2: [{ key: "people:keeper:1", page: "people", name: "The keeper", first: true, facts: ["Keeps the gate keys."] }] },
  meter: { 2: { moved: "The Yard", rows: [{ toName: "The Tower", met: 1, total: 2, ready: false, open: ["bell state = rung, now silent"] }] } },
  chips: { messageId: 2, yours: true, ideas: true, offers: [{ key: "ask", text: "I ask the keeper about the gate." }] },
};

const MESSAGES = [
  { id: 1, name: "You", text: "I set the watch and walk to the yard." },
  { id: 2, name: "Mara", text: "The yard gate creaks open. An old keeper looks up from his fire." },
];

const fakePort = (): InChatHostPort => ({
  slot: (slot: InChatSlot, ids: number[]) => {
    const hosts = new Map<number, HTMLElement>();
    document.querySelectorAll(`[data-fake-slot="${slot}"]`).forEach((host) => { if (!ids.includes(Number((host as HTMLElement).dataset.mesid))) host.remove(); });
    for (const id of ids) {
      const block = document.querySelector(`[data-fake-mes="${id}"]`);
      if (!block) continue;
      let host = block.querySelector<HTMLElement>(`[data-fake-slot="${slot}"]`);
      if (!host) {
        host = document.createElement("div");
        host.className = "so-slot";
        host.id = `so-slot-${slot}-${id}`;
        host.dataset.fakeSlot = slot;
        host.dataset.mesid = String(id);
        if (slot === "between") block.prepend(host);
        else block.append(host);
      }
      hosts.set(id, host);
    }
    return hosts;
  },
  onRebuild: () => () => undefined,
});

const FakeChat = ({ view }: { view: InChatView }) => {
  const port = fakePort();
  return (
    <div>
      {MESSAGES.map((message) => (
        <div key={message.id} data-fake-mes={message.id} style={{ padding: "8px 0" }}>
          <strong>{message.name}</strong>
          <p style={{ margin: "4px 0" }}>{message.text}</p>
        </div>
      ))}
      <InChatLayer view={view} hosts={port} actions={{ fill: fn(() => ({ ok: true as const })), openSheet: fn() }} />
    </div>
  );
};

const meta: Meta<typeof FakeChat> = {
  title: "Inline/InChat/InChatLayer",
  component: FakeChat,
  args: { view: VIEW },
};

export default meta;

type Story = StoryObj<typeof FakeChat>;

export const AuthorView: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-so="chat-end-chips"]')).not.toBeNull());
    const block = canvasElement.querySelector('[data-fake-mes="2"]') as HTMLElement;
    await expect(block.firstElementChild?.querySelector('[data-so="in-chat-divider"]')).not.toBeNull();
    await expect(block.querySelector('[data-so="because-ribbon"]')).not.toBeNull();
    await expect(block.querySelector('[data-so="discovery-card"]')).not.toBeNull();
    await expect(block.querySelector('[data-so="gate-meter"]')).not.toBeNull();
  },
};

export const PlayerView: Story = {
  args: { view: { ...VIEW, author: false, meter: {} } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-so="chat-end-chips"]')).not.toBeNull());
    await expect(canvasElement.querySelector('[data-so="gate-meter"]')).toBeNull();
  },
};
