import { lastMessageTextOf, windowOf } from "../../src/extraction/chatRows";
import type { MemoryHosts } from "../../src/runtime/hostPorts";

type Fake = Record<string, unknown>;

export interface FakeHosts extends MemoryHosts {
  player: never;
  curator: never;
  provisioning: never;
}

export const fakeHosts = (host: Fake): FakeHosts => {
  const pick = (name: string | symbol) => {
    const value = host[String(name)];
    if (value !== undefined) return value;
    return () => { throw new TypeError(`the fake host has no ${String(name)}`); };
  };
  const surface = <T extends object>(extra: T = {} as T) => new Proxy(extra, { get: (target, name) => (name in target ? target[name as keyof T] : pick(name)) }) as never;
  const context = () => ((host.getContext as (() => { chat?: unknown; chatId?: string | null }) | undefined)?.() ?? {});
  const chatRows = (): unknown[] => { const chat = context().chat; return Array.isArray(chat) ? chat : []; };
  return {
    prompt: surface(),
    injection: surface(),
    tokens: surface(),
    curator: surface(),
    provisioning: surface(),
    player: surface(),
    vectors: surface({ source: "transformers" }),
    mirror: surface({ owner: host.currentChatOwner }),
    chat: {
      chatRows,
      chatWindow: (from, to) => windowOf(chatRows(), from, to),
      lastMessageText: () => lastMessageTextOf(chatRows()),
      chatId: () => context().chatId ?? null,
    },
    roster: surface({ chatRows, systemUserName: host.hostSystemUserName as string }),
  };
};
