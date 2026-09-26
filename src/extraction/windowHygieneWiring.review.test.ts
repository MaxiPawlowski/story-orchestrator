import { readWith } from "../../test/support/modelCall";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { getChatWindow, getLastMessageText } from "./chatWindow";
import { buildFixtureRun } from "./fixtureRun";
import { renderSharedReadPrompt } from "./contract";
import { runSharedRead } from "./sharedRead";
import { createTokenMeter } from "./tokenMeter";
import { CLEANED_FORM } from "./windowHygiene";

const chatRef = { current: [] as unknown[] };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: chatRef.current, extensionSettings: {} }),
}));

const TRACKER = "door_open: true";

const hostChat = () => [
  { name: "Max", is_user: true, is_system: false, mes: "I ask Mara whether the vault door is open." },
  { name: "SillyTavern System", is_user: false, is_system: false, mes: "the vault door ajar, lamplight", extra: { media: [{ url: "/i.png", type: "image", title: "vault", generation_type: 6, negative: "", source: "generated" }], media_display: "gallery", media_index: 0, inline_image: false } },
  { name: "Mara", is_user: false, is_system: false, mes: `Mara shakes her head. The door stays shut. <div style="display: none"> ${TRACKER} </div>` },
  { name: "Mara", is_user: false, is_system: false, is_thoughts: true, owner_extension: "st-stepped-thinking", mes: "<details type=\"executing\"><summary>Thinking (Mara)</summary>\n```md\nShe lies.\n```\n</details>", extra: { api: "script", model: "stepped thinking" } },
  { name: "CYOA Suggestions", is_user: true, is_system: false, mes: "<div><button>1. I force the door</button></div>", extra: { api: "manual", model: "cyoa" } },
  { name: "Note", is_user: false, is_system: true, mes: "Checkpoint reached", extra: { type: "comment" } },
];

const story = () => parseStoryV2OrThrow({
  format: 2,
  id: "hygiene",
  title: "Hygiene",
  description: "v2.4 plan 04 T7",
  qualities: [{ key: "door_open", type: "bool", source: "extractor", rubric: "Is the vault door open?" }],
  checkpoints: [
    { id: "hall", name: "Hall", objective: "Open the door", type: "anchor", start: true },
    { id: "vault", name: "Vault", objective: "Enter", type: "anchor" },
  ],
  transitions: [{ id: "open", from: "hall", to: "vault", priority: 0, gate: { q: "door_open", op: "==", v: true } }],
  roster: [],
});

const read = async (debugResponse: string) => {
  const s = story();
  const engine = new StoryEngine();
  engine.loadStory(s);
  const state = { ...engine.serialize(), lastMessageId: chatRef.current.length - 1 };
  return runSharedRead({ story: s, state, priority: 0, reason: "hygiene", ...readWith("p1", { debugResponse }) });
};

beforeEach(() => { chatRef.current = hostChat(); });

describe("v2.4 plan 04 T7: every window reader takes the cleaned text", () => {
  it("getChatWindow keeps the player and the cleaned reply, drops the foreign posts, and states its form", () => {
    const window = getChatWindow(0);
    expect(window.messages).toEqual([
      { index: 0, messageId: 0, speaker: "Max", text: "I ask Mara whether the vault door is open.", isUser: true },
      { index: 2, messageId: 2, speaker: "Mara", text: "Mara shakes her head. The door stays shut.", isUser: false },
    ]);
    expect(window.form).toEqual(CLEANED_FORM);
  });

  it("getLastMessageText skips a trailing foreign post and an in-flight reply", () => {
    chatRef.current = [...hostChat(), { name: "Mara", is_user: false, mes: "Half a sen", gen_started: "t0" }];
    expect(getLastMessageText()).toBe("Mara shakes her head. The door stays shut.");
  });

  it("the prompt, the evidence check and the stored evidence read one text: a quote from a hidden tracker is refused", async () => {
    const result = await read(`DELTA door_open value=true evidence="${TRACKER}"`);
    expect(result.audit.prompt).not.toContain(TRACKER);
    expect(result.audit.prompt).not.toContain("I force the door");
    expect(result.audit.prompt).not.toContain("lamplight");
    expect(result.audit.prompt).not.toContain("She lies");
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.audit.rejected.map((entry) => entry.reason)).toEqual(["evidence not in window"]);
  });

  it("control: a quote from the text the player saw is accepted", async () => {
    const result = await read("DELTA door_open value=false evidence=\"The door stays shut\"");
    expect(result.audit.acceptedDeltas.map((entry) => entry.delta.v)).toEqual([false]);
    expect(result.audit.rejected).toEqual([]);
  });

  it("the audit records the window form, and the contract hash follows it", async () => {
    const result = await read("NO_DELTA");
    expect(result.audit.windowForm).toEqual(CLEANED_FORM);
    const raw = await (async () => {
      const s = story();
      const engine = new StoryEngine();
      engine.loadStory(s);
      const window = { ...getChatWindow(0), form: undefined };
      return runSharedRead({ story: s, state: engine.serialize(), priority: 0, reason: "hygiene", window, ...readWith("p1", { debugResponse: "NO_DELTA" }) });
    })();
    expect(raw.audit.windowForm).toBeUndefined();
    expect(raw.audit.prompt).toBe(result.audit.prompt);
    expect(raw.audit.contractHash).not.toBe(result.audit.contractHash);
  });

  it("a read tail-fit to its budget still states the form of the window it sent", async () => {
    chatRef.current = Array.from({ length: 8 }, (_, index) => ({ name: index % 2 ? "Mara" : "Max", is_user: index % 2 === 0, mes: `Line ${index}: ${"the long road winds on beside the river ".repeat(50)}` }));
    const s = story();
    const engine = new StoryEngine();
    engine.loadStory(s);
    const state = { ...engine.serialize(), lastMessageId: 7 };
    const result = await runSharedRead({ story: s, state, priority: 0, reason: "hygiene", ...readWith("p1", { debugResponse: "NO_DELTA", budget: { contextLimit: { value: 3000, source: "preset" }, meter: createTokenMeter() } }) });
    expect(result.audit.trimmedFrom).toBe(0);
    expect(result.audit.windowForm).toEqual(CLEANED_FORM);
  });

  it("the fixture path takes the same cleaner, so jest and the live suite read what play reads", () => {
    const run = buildFixtureRun({ story: story(), transcript: [{ index: 0, speaker: "Mara", text: `The door stays shut.<div style="display:none">${TRACKER}</div>` }] });
    expect(run.prompt).not.toContain(TRACKER);
    expect(run.prompt).toContain("[0] Mara: The door stays shut.");
    const unchanged = buildFixtureRun({ story: story(), transcript: [{ index: 3, speaker: "Mara", text: "The door stays shut." }] });
    expect(unchanged.prompt).toBe(renderSharedReadPrompt({ storyTitle: "Hygiene", activeCheckpointId: "hall", qualities: unchanged.scope, window: { from: 3, to: 3, messages: [{ index: 3, messageId: 3, speaker: "Mara", text: "The door stays shut.", isUser: false }] }, canon: "Anchor hall: Open the door" }));
  });
});
