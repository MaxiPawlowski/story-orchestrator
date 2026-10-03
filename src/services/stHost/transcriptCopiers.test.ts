import { SUMMARIZE_PROMPT_KEY, transcriptCopiersOn, VECTORS_PROMPT_KEY } from "./transcriptCopiers";

const summarize = (overrides: Record<string, unknown> = {}) => ({ memoryFrozen: false, source: "main", promptInterval: 10, position: 0, ...overrides });
const root = (overrides: Record<string, unknown> = {}) => ({ disabledExtensions: [], memory: summarize(), vectors: { enabled_chats: true }, ...overrides });

describe("v2.7 plan 02 C2: which ST transcript copiers are switched on", () => {
  it("names Summarize and chat vectors when both would copy the transcript", () => {
    expect(transcriptCopiersOn(root())).toEqual([SUMMARIZE_PROMPT_KEY, VECTORS_PROMPT_KEY]);
    expect(transcriptCopiersOn(root({ memory: summarize({ source: "webllm", position: "1" }) }))).toEqual([SUMMARIZE_PROMPT_KEY, VECTORS_PROMPT_KEY]);
  });

  it.each([
    ["the extension disabled", { disabledExtensions: ["memory"] }],
    ["paused", { memory: summarize({ memoryFrozen: true }) }],
    ["interval 0", { memory: summarize({ promptInterval: 0 }) }],
    ["position none, stored as the radio's string", { memory: summarize({ position: "-1" }) }],
    ["the retired Extras source", { memory: summarize({ source: "extras" }) }],
    ["never configured", { memory: undefined }],
  ])("Summarize is off when %s", (_label, overrides) => {
    expect(transcriptCopiersOn(root(overrides))).toEqual([VECTORS_PROMPT_KEY]);
  });

  it.each([
    ["the extension disabled", { disabledExtensions: ["vectors"] }],
    ["chat vectors unticked", { vectors: { enabled_chats: false } }],
    ["never configured", { vectors: undefined }],
  ])("chat vectors are off when %s", (_label, overrides) => {
    expect(transcriptCopiersOn(root(overrides))).toEqual([SUMMARIZE_PROMPT_KEY]);
  });

  it("settings not loaded yet, or unreadable, name nothing", () => {
    expect(transcriptCopiersOn(undefined)).toEqual([]);
    expect(transcriptCopiersOn(null)).toEqual([]);
    expect(transcriptCopiersOn("x")).toEqual([]);
    expect(transcriptCopiersOn({})).toEqual([]);
  });
});
