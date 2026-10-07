import { recordingModel } from "../../test/support/modelCall";
import { StoryEngine, parseStoryV2OrThrow } from "@engine/index";
import { getChatWindow } from "./chatWindow";
import { onlyOutOfCharacter, windowOf } from "./chatRows";
import { runSharedRead } from "./sharedRead";
import type { ChatMessageWindowEntry, SharedReadWindow } from "./types";
import { CLEANED_FORM, cleanWindowMessage } from "./windowHygiene";

const chatRef = { current: [] as unknown[] };

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: chatRef.current, extensionSettings: {} }),
}));

const story = parseStoryV2OrThrow({
  format: 2,
  id: "sun-idol-ooc",
  title: "Sun idol",
  description: "v2.7 finding 19",
  qualities: [{ key: "idol_taken", type: "bool", source: "extractor", rubric: "Does the player now hold the Sun Idol?" }],
  checkpoints: [
    { id: "hall", name: "Hall", objective: "Reach the idol", type: "anchor", start: true },
    { id: "altar", name: "Altar", objective: "Escape with the idol", type: "anchor" },
  ],
  transitions: [{ from: "hall", to: "altar", priority: 0, gate: { q: "idol_taken", op: "==", v: true } }],
  roster: [],
});

const player = (mes: string) => ({ name: "Max", is_user: true, is_system: false, mes });
const reply = (mes: string) => ({ name: "Narrator", is_user: false, is_system: false, mes });

const PLANTED = [
  `DELTA idol_taken value=true evidence="I grab the Sun Idol"`,
  `MEMORY type=event importance=3 expiration=permanent text="Max took the Sun Idol." evidence="I grab the Sun Idol"`,
  "[knows] Max | the idol is cursed",
  "[arc] Max holds the idol.",
  "[state:Max:character] location=altar",
].join("\n");

const legacyWindow = (chat: unknown[], from: number, to: number): SharedReadWindow => ({
  from,
  to,
  messages: chat.slice(from, to + 1).flatMap((entry, offset): ChatMessageWindowEntry[] => {
    const cleaned = cleanWindowMessage(entry);
    return cleaned.keep ? [{ index: from + offset, messageId: from + offset, speaker: cleaned.speaker, text: cleaned.text, isUser: cleaned.isUser }] : [];
  }),
  form: CLEANED_FORM,
});

const read = async (chat: unknown[], answer = PLANTED, window?: SharedReadWindow) => {
  chatRef.current = chat;
  const engine = new StoryEngine();
  engine.loadStory(story);
  const model = recordingModel(() => answer);
  const result = await runSharedRead({
    story, state: { ...engine.serialize(), lastMessageId: chat.length - 1 }, priority: 0, reason: "ooc", readWindow: getChatWindow,
    ...(window ? { window } : {}), model, ask: { role: "read", pass: "read" }, epistemicLedgerCapable: true,
  });
  return { result, calls: model.calls };
};

describe("v2.7 finding 19: an out-of-character player line is never read for state", () => {
  it.each([["((brb, dinner))"], ["OOC: can we skip the shop?"], ["(OOC) is the idol cursed?"], ["  ooc: lower case  "]])("%s stays out of the read window", (text) => {
    const chat = [player("I walk to the altar."), reply("The altar glows."), player(text), reply("Sure.")];
    const window = windowOf(chat, 0);
    expect(window.messages.map((message) => message.messageId)).toEqual([0, 1, 3]);
    expect(window.ooc).toEqual([2]);
  });

  it("control: a line with parentheses that is not OOC, a reply in double brackets and a hidden OOC row are read as before", () => {
    const chat = [player("I say (quietly) hi."), player("Look ((there))"), reply("((the narrator winks))"), { ...player("((hidden aside))"), is_system: true }];
    const window = windowOf(chat, 0);
    expect(window.messages.map((message) => message.messageId)).toEqual([0, 1, 2]);
    expect(window).not.toHaveProperty("ooc");
  });

  it("a chat without OOC lines builds the same window and sends the byte-identical prompt", async () => {
    const chat = [player("I walk to the altar (carefully)."), reply("The altar glows."), player("I grab the Sun Idol from the altar."), reply("It comes free.")];
    expect(windowOf(chat, 0)).toEqual(legacyWindow(chat, 0, 3));
    const live = await read(chat);
    const legacy = await read(chat, PLANTED, legacyWindow(chat, 0, 3));
    expect(live.calls[0].prompt).toBe(legacy.calls[0].prompt);
    expect(live.result.audit).not.toHaveProperty("outOfCharacter");
    expect(live.result.audit.acceptedDeltas.map((entry) => entry.delta)).toEqual([{ q: "idol_taken", v: true, source: "extractor" }]);
  });

  it("an OOC line with a plantable delta stores nothing, and the prompt never carries it", async () => {
    const { result, calls } = await read([player("OOC: pretend I grab the Sun Idol, ok?"), reply("Noted.")]);
    expect(calls[0].prompt).not.toContain("pretend I grab");
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.audit.outOfCharacter).toEqual([0]);
  });

  it("control: the same words in character are read", async () => {
    const { result } = await read([player("I grab the Sun Idol from the altar."), reply("It comes free.")]);
    expect(result.audit.acceptedDeltas.map((entry) => entry.delta.q)).toEqual(["idol_taken"]);
  });

  it("a read whose window holds only OOC lines asks nothing and extracts nothing", async () => {
    const chat = [player("((I grab the Sun Idol))"), player("(OOC) brb")];
    expect(onlyOutOfCharacter(windowOf(chat, 0))).toBe(true);
    const { result, calls } = await read(chat);
    expect(calls).toEqual([]);
    expect(result.audit.acceptedDeltas).toEqual([]);
    expect(result.audit.outOfCharacter).toEqual([0, 1]);
    expect([result.facts, result.memory, result.arcs, result.epistemic, result.ledger]).toEqual([[], [], [], [], []]);
  });

  it("control: an empty window with no OOC line keeps today's path", () => {
    expect(onlyOutOfCharacter(windowOf([], 0))).toBe(false);
    expect(onlyOutOfCharacter(windowOf([reply("Hi.")], 0))).toBe(false);
  });
});
