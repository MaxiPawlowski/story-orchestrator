/**
 * @jest-environment jsdom
 */
const handlers = new Map<string, () => void>();
const unsubscribe = jest.fn();

jest.mock("./events", () => ({
  subscribeToHostEvents: (entries: Array<{ eventName: string; handler: () => void }>) => {
    entries.forEach((entry) => handlers.set(entry.eventName, entry.handler));
    return unsubscribe;
  },
}));

import { mountInlineHosts } from "./inlineMount";

const renderChat = (ids: number[]) => {
  const messages = ids.map((id) => `<div class="mes" mesid="${id}"><div class="mes_block"><div class="mes_text">text ${id}</div></div></div>`).join("");
  const chat = document.getElementById("chat");
  if (chat) chat.innerHTML = messages;
  else document.body.innerHTML = `<div id="chat">${messages}</div>`;
};

const mounted = () => {
  const result = mountInlineHosts();
  if (!result.ok) throw new Error(result.reason);
  return result.hosts;
};

describe("inline hosts (v2.6 plan 08 D1): the one module that writes into ST's message DOM", () => {
  beforeEach(() => handlers.clear());

  beforeEach(() => { document.body.innerHTML = ""; });

  it("refuses without a chat, with a reason", () => {
    expect(mountInlineHosts()).toEqual({ ok: false, reason: "the chat is not on the page" });
  });

  it("puts one host per wanted message at the end of .mes_block, never inside .mes_text, and removes the unwanted", () => {
    renderChat([0, 1, 2]);
    const hosts = mounted();
    const first = hosts.sync([1, 2, 9]);
    expect([...first.keys()]).toEqual([1, 2]);
    expect(first.get(1)?.id).toBe("so-inline-1");
    expect(first.get(1)?.parentElement?.className).toBe("mes_block");
    expect(document.querySelector(".mes_text .so-inline-host")).toBeNull();
    const second = hosts.sync([2]);
    expect(second.get(2)).toBe(first.get(2));
    expect(document.getElementById("so-inline-1")).toBeNull();
  });

  it("re-creates a host under the message that now carries its id after ST renumbers or rebuilds", () => {
    renderChat([0, 1]);
    const hosts = mounted();
    const before = hosts.sync([1]).get(1);
    document.querySelector('.mes[mesid="1"]')?.setAttribute("mesid", "0");
    document.querySelectorAll(".mes")[0].setAttribute("mesid", "5");
    const after = hosts.sync([1]);
    expect(after.size).toBe(0);
    expect(document.getElementById("so-inline-1")).toBeNull();
    renderChat([0, 1]);
    const rebuilt = hosts.sync([1]).get(1);
    expect(rebuilt).not.toBe(before);
    expect(rebuilt?.isConnected).toBe(true);
  });

  it("asks for a re-sync on every event that can replace a message, once per burst, and disposes cleanly", async () => {
    renderChat([0]);
    const hosts = mounted();
    expect([...handlers.keys()].sort()).toEqual(["CHARACTER_MESSAGE_RENDERED", "CHAT_CHANGED", "MESSAGE_DELETED", "MESSAGE_SWIPED", "MESSAGE_UPDATED", "MORE_MESSAGES_LOADED", "USER_MESSAGE_RENDERED"]);
    const listener = jest.fn();
    hosts.onRebuild(listener);
    handlers.get("CHARACTER_MESSAGE_RENDERED")?.();
    handlers.get("MESSAGE_UPDATED")?.();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    hosts.sync([0]);
    expect(hosts.attachTimes()).toHaveLength(2);
    hosts.dispose();
    expect(unsubscribe).toHaveBeenCalled();
    expect(document.querySelector(".so-inline-host")).toBeNull();
  });
});
