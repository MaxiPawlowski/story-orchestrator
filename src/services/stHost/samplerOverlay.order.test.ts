type Listener = (...args: unknown[]) => void;

class Emitter {
  events: Record<string, Listener[]> = {};
  on(event: string, listener: Listener) { (this.events[event] ??= []).push(listener); }
  off(event: string, listener: Listener) { this.events[event] = (this.events[event] ?? []).filter((row) => row !== listener); }
  makeLast(event: string, listener: Listener) { this.off(event, listener); (this.events[event] ??= []).push(listener); }
  emit(event: string, ...args: unknown[]) { for (const listener of [...(this.events[event] ?? [])]) listener(...args); }
}

type Source = Pick<Emitter, "events" | "on" | "off" | "emit"> & { makeLast?: Emitter["makeLast"] };
const host: { eventSource: Source } = { eventSource: new Emitter() };

jest.mock("./context", () => ({
  getContext: () => ({ eventSource: host.eventSource, eventTypes: { GENERATE_AFTER_DATA: "generate_after_data", GENERATION_STARTED: "generation_started",
    CHAT_COMPLETION_SETTINGS_READY: "chat_completion_settings_ready" } }),
}));

import { observeSamplerPayloads } from "./samplerOverlay";

const overlay = () => observeSamplerPayloads({ textgen: (payload) => { payload.temperature = 0.9; }, chat: (payload) => { payload.temperature = 0.9; } });
const peer = (event: string) => host.eventSource.on(event, (payload) => { (payload as Record<string, unknown>).temperature = 0.5; });

beforeEach(() => { host.eventSource = new Emitter(); });

test("B8: a peer extension that subscribes after the overlay no longer overwrites its keys once a generation starts", () => {
  const off = overlay();
  peer("generate_after_data");
  peer("chat_completion_settings_ready");
  host.eventSource.emit("generation_started");
  const textgen: Record<string, unknown> = {}, chat: Record<string, unknown> = {};
  host.eventSource.emit("generate_after_data", textgen, false);
  host.eventSource.emit("chat_completion_settings_ready", chat);
  expect([textgen.temperature, chat.temperature]).toEqual([0.9, 0.9]);
  off();
  const after: Record<string, unknown> = {};
  host.eventSource.emit("generate_after_data", after, false);
  expect(after.temperature).toBe(0.5);
  expect(host.eventSource.events.generation_started ?? []).toHaveLength(0);
});

test("B8: a host without makeLast keeps the plain subscription", () => {
  const full = new Emitter();
  host.eventSource = { events: full.events, on: full.on.bind(full), off: full.off.bind(full), emit: full.emit.bind(full) };
  overlay();
  const payload: Record<string, unknown> = {};
  host.eventSource.emit("generate_after_data", payload, false);
  expect(payload.temperature).toBe(0.9);
});
