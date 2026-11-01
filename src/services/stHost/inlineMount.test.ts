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

describe("message slots (v3.0 44): named hosts per message, one owner, one cleanup path", () => {
  beforeEach(() => { document.body.innerHTML = ""; handlers.clear(); });

  const renderFull = (ids: number[]) => {
    document.body.innerHTML = `<div id="chat">${ids.map((id) => `<div class="mes" mesid="${id}"><div class="mesAvatarWrapper"></div><div class="mes_block">`
      + `<div class="ch_name"><div><div class="row"><span class="name_text">N${id}</span><small class="timestamp"></small></div></div></div>`
      + `<details class="mes_reasoning_details"></details><div class="mes_text">text ${id}</div></div></div>`).join("")}</div>`;
  };

  it("places each slot in its own spot around the text and never inside the text or the chat list itself", () => {
    renderFull([0, 1]);
    const hosts = mounted();
    hosts.slot("end", [1]);
    hosts.slot("meter", [1]);
    hosts.sync([1]);
    hosts.slot("after", [1]);
    hosts.slot("between", [1]);
    hosts.slot("above", [1]);
    hosts.slot("name", [1]);
    const block = document.querySelector('.mes[mesid="1"] .mes_block') as HTMLElement;
    const order = Array.from(block.children).map((child) => (child as HTMLElement).dataset.slot ?? child.className);
    expect(order).toEqual(["between", "ch_name", "above", "mes_reasoning_details", "mes_text", "after", "below", "meter", "end"]);
    expect(document.querySelector('.mes[mesid="1"] .name_text')?.parentElement?.lastElementChild?.id).toBe("so-slot-name-1");
    expect(document.querySelector(".mes_text .so-slot")).toBeNull();
    expect(Array.from(document.getElementById("chat")?.children ?? []).every((child) => child.classList.contains("mes"))).toBe(true);
    expect(document.getElementById("so-inline-1")?.dataset.slot).toBe("below");
  });

  it("a slot sync touches only its own slot, moves the chat-end host to the new last message, and dispose removes every slot", () => {
    renderFull([0, 1, 2]);
    const hosts = mounted();
    hosts.sync([0, 1]);
    const end = hosts.slot("end", [1]).get(1);
    hosts.slot("between", [2]);
    const moved = hosts.slot("end", [2]);
    expect(end?.isConnected).toBe(false);
    expect(moved.get(2)?.closest(".mes")?.getAttribute("mesid")).toBe("2");
    expect(document.querySelectorAll(".so-inline-host")).toHaveLength(2);
    expect(document.getElementById("so-slot-between-2")).not.toBeNull();
    hosts.dispose();
    expect(document.querySelector(".so-slot")).toBeNull();
  });

  it("skips the name slot when the message has no name row, and drops a host that ended up under another message", () => {
    renderChat([0]);
    expect(mounted().slot("name", [0]).size).toBe(0);
    renderFull([0, 1]);
    const hosts = mounted();
    const host = hosts.slot("above", [0]).get(0) as HTMLElement;
    document.querySelector('.mes[mesid="1"] .mes_block')?.appendChild(host);
    const again = hosts.slot("above", [0]).get(0);
    expect(host.isConnected).toBe(false);
    expect(again?.previousElementSibling?.className).toBe("ch_name");
    expect(again?.closest(".mes")?.getAttribute("mesid")).toBe("0");
  });

  it("asks for a re-sync when ST adds or removes a message without an event", async () => {
    renderFull([0]);
    const hosts = mounted();
    const listener = jest.fn();
    hosts.onRebuild(listener);
    const extra = document.createElement("div");
    extra.className = "mes";
    document.getElementById("chat")?.appendChild(extra);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledTimes(1);
    hosts.slot("between", [0]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledTimes(1);
    hosts.dispose();
  });
});
