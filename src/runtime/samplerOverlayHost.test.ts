const handlers: { textgen?: (payload: Record<string, unknown>, dryRun: boolean) => void; chat?: (payload: Record<string, unknown>) => void; disposed: number } = { disposed: 0 };

jest.mock("@services/STAPI", () => ({
  observeSamplerPayloads: (next: typeof handlers) => {
    handlers.textgen = next.textgen;
    handlers.chat = next.chat;
    return () => { handlers.disposed += 1; };
  },
}));

import { SamplerOverlay } from "./samplerOverlay";
import { startSamplerOverlay } from "./samplerOverlayHost";
import type { GenerationLifecycleSnapshot } from "./generationLifecycle";

const idle = { outermost: null, nested: [], awaitingRender: null, draftedChid: null } as Partial<GenerationLifecycleSnapshot> as GenerationLifecycleSnapshot;
const open = (type: string, nested: string[] = []) =>
  ({ outermost: { type, watermark: 3 }, nested, awaitingRender: null, draftedChid: null }) as Partial<GenerationLifecycleSnapshot> as GenerationLifecycleSnapshot;

function wire(api: "textgen" | "chat") {
  const overlay = new SamplerOverlay();
  overlay.set({ chatId: "chat-a", checkpointId: "cp-1", name: "Cool", api, values: { temperature: 0.5 }, unknown: [] });
  const state = { generation: idle, notes: [] as string[] };
  const dispose = startSamplerOverlay({ chatId: () => "chat-a", generation: () => state.generation, journal: (summary) => { state.notes.push(summary); }, overlay });
  return { overlay, state, dispose };
}

describe("v2.4 plan 06: the overlay follows the T6 lifecycle", () => {
  it("a loud Text Completion request inside an open generation is overlaid and journaled once", () => {
    const { state } = wire("textgen");
    state.generation = open("normal");
    const first = { temperature: 1 };
    const second = { temperature: 1 };
    handlers.textgen?.(first, false);
    handlers.textgen?.(second, false);
    expect([first.temperature, second.temperature]).toEqual([0.5, 0.5]);
    expect(state.notes).toEqual(['Sampler overlay "Cool" applied to this checkpoint\'s replies']);
  });

  it("a quiet run nested in the loud one keeps its own samplers", () => {
    const { state } = wire("chat");
    state.generation = open("normal", ["quiet"]);
    const payload = { temperature: 1, type: "quiet" };
    handlers.chat?.(payload);
    expect(payload.temperature).toBe(1);
  });

  it("a request with no generation open (an extension's own call) is left alone", () => {
    const { state } = wire("chat");
    state.generation = idle;
    const payload = { temperature: 1 };
    handlers.chat?.(payload);
    expect(payload.temperature).toBe(1);
  });

  it("a dry run is left alone", () => {
    const { state } = wire("textgen");
    state.generation = open("normal");
    const payload = { temperature: 1 };
    handlers.textgen?.(payload, true);
    expect(payload.temperature).toBe(1);
  });

  it("dispose releases both hooks", () => {
    const before = handlers.disposed;
    wire("chat").dispose();
    expect(handlers.disposed).toBe(before + 1);
  });
});
