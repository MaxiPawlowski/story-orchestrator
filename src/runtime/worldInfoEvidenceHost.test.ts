import { parseStoryV2OrThrow } from "@engine/index";

type Listener = (...args: unknown[]) => unknown;

// ST's emitter shape (lib/eventemitter.js): `emit` copies the listener list and awaits each in turn;
// `makeFirst` / `makeLast` reposition at call time only (05-H11).
const emitter = {
  events: new Map<string, Listener[]>(),
  on(event: string, listener: Listener) { this.events.set(event, [...(this.events.get(event) ?? []), listener]); },
  off(event: string, listener: Listener) { this.events.set(event, (this.events.get(event) ?? []).filter((entry) => entry !== listener)); },
  makeFirst(event: string, listener: Listener) { this.events.set(event, [listener, ...(this.events.get(event) ?? []).filter((entry) => entry !== listener)]); },
  makeLast(event: string, listener: Listener) { this.events.set(event, [...(this.events.get(event) ?? []).filter((entry) => entry !== listener), listener]); },
  async emit(event: string, ...args: unknown[]) { for (const listener of [...(this.events.get(event) ?? [])]) await listener(...args); },
};

const context = { eventSource: emitter, eventTypes: { WORLD_INFO_ACTIVATED: "world_info_activated", WORLDINFO_ENTRIES_LOADED: "worldinfo_entries_loaded" } };

jest.mock("@services/stHost/context", () => ({ getContext: () => context }));
jest.mock("@services/STAPI", () => jest.requireActual("@services/stHost/worldInfoEvidence"));

import { LoreEvidence } from "./worldInfoEvidence";
import { startLoreEvidence, storyBooks } from "./worldInfoEvidenceHost";

const story = parseStoryV2OrThrow({
  format: 2,
  title: "Host",
  description: "Evidence wiring fixture.",
  qualities: [],
  requirements: { lorebooks: ["Ruins"] },
  checkpoints: [{ id: "one", name: "One", objective: "One.", type: "anchor", start: true, effects: { world_info: { enable: [{ lorebook: "Ruins", comments: ["CP1 Road"] }] } } }],
  transitions: [],
  roster: [],
});

const loadedPayload = (global: unknown[]) => ({ globalLore: global, characterLore: [], chatLore: [], personaLore: [] });

const start = () => {
  emitter.events.clear();
  const evidence = new LoreEvidence();
  const journal: string[] = [];
  const nested: string[] = [];
  const controls = startLoreEvidence({
    chatId: () => "chat-1",
    context: () => ({ chatId: "chat-1", storyId: "host", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedSince: () => null }),
    story: () => story,
    state: () => ({ visitedPath: ["one"] } as never),
    mirrorBook: () => null,
    lastMessageId: () => 4,
    innermostType: () => nested[nested.length - 1] ?? "normal",
    journal: (flag) => journal.push(flag.kind),
    notify: () => undefined,
    evidence,
  });
  return { evidence, journal, nested, controls };
};

describe("startLoreEvidence", () => {
  it("opens a slot for a loud generation only, and records scans only while it is open", async () => {
    const { evidence, controls } = start();
    controls.opened("quiet");
    await emitter.emit("world_info_activated", [{ world: "Ruins", uid: 1, comment: "CP1 Road" }]);
    controls.settled(false);
    expect(evidence.slotsForChat()).toEqual([]);
    controls.opened("normal");
    await emitter.emit("world_info_activated", [{ world: "Ruins", uid: 1, comment: "CP1 Road" }]);
    controls.settled(true);
    expect(evidence.view(story, null).last?.fired.map((row) => row.comment)).toEqual(["CP1 Road"]);
  });

  it("tags a scan with the innermost generation, so a nested quiet run's activations do not land a pick", async () => {
    const { evidence, journal, nested, controls } = start();
    controls.opened("normal");
    controls.forced([{ world: "Lore", uid: 4, comment: "NPC - Ellie" }]);
    nested.push("quiet");
    await emitter.emit("world_info_activated", [{ world: "Lore", uid: 4, comment: "NPC - Ellie" }]);
    nested.pop();
    await emitter.emit("world_info_activated", [{ world: "Ruins", uid: 1, comment: "CP1 Road", constant: true }]);
    controls.settled(true);
    expect(journal).toEqual(["lore-force-lost"]);
    expect(evidence.view(story, null).last?.nestedScans).toBe(1);
  });

  it("the first and last observers bracket every other listener, re-placed at each generation", async () => {
    const { evidence, controls } = start();
    const splicer: Listener = (payload) => {
      const lore = (payload as { globalLore: Array<{ world: string }> }).globalLore;
      for (let index = lore.length - 1; index >= 0; index -= 1) if (lore[index].world === "Ruins") lore.splice(index, 1);
    };
    emitter.on("worldinfo_entries_loaded", splicer);
    const generation = async () => {
      controls.reassert();
      controls.opened("normal");
      await emitter.emit("worldinfo_entries_loaded", loadedPayload([{ world: "Ruins", uid: 1, comment: "CP1 Road" }, { world: "Other", uid: 2, comment: "x" }]));
      await emitter.emit("world_info_activated", [{ world: "Other", uid: 2, comment: "x" }]);
      controls.settled(true);
    };
    await generation();
    expect(evidence.hiddenBooks()).toEqual([]);
    await generation();
    expect(evidence.hiddenBooks()).toEqual(["Ruins"]);
  });

  it("control: without the splicer the same two generations hide nothing", async () => {
    const { evidence, controls } = start();
    for (let index = 0; index < 2; index += 1) {
      controls.reassert();
      controls.opened("normal");
      await emitter.emit("worldinfo_entries_loaded", loadedPayload([{ world: "Ruins", uid: 1, comment: "CP1 Road" }]));
      controls.settled(true);
    }
    expect(evidence.hiddenBooks()).toEqual([]);
  });

  it("dispose detaches every observer", async () => {
    const { evidence, controls } = start();
    controls.dispose();
    expect([...emitter.events.values()].flat()).toEqual([]);
    expect(evidence.slotsForChat()).toEqual([]);
  });

  it("watches every book the story reads from, once each", () => {
    const withScope = { ...story, lore_select: { lorebooks: ["Lore", "ruins"] } } as typeof story;
    expect(storyBooks(withScope, "Story Orchestrator - Host - chat-1")).toEqual(["Ruins", "Lore", "Story Orchestrator - Host - chat-1"]);
  });
});
