jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true, settingsReady: async () => {}, getContext: () => ({ chat: [], extensionSettings: {} }),
  registerHostMacro: jest.fn(), unregisterHostMacro: jest.fn(), isHostGenerating: () => false,
}));
jest.mock("./settingsStore", () => ({ getGlobalSettings: () => jest.requireActual("./settingsModel").sanitizeGlobalSettings(undefined) }));

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseStoryOrThrow, type EngineState, type NormalizedStory } from "@engine/index";
import { readPromptOptions } from "@extraction/sharedReadEntry";
import { memberAimsBlock, renderNarratorBlock } from "@memory/innerRender";
import type { ArcEntry, CastVoice, EpistemicEntry } from "@memory/index";
import { READ_LAYOUT_TURNS, readLayoutRead } from "../../test/support/readLayoutFixture";
import { groundingStory, playGrounding } from "../../test/support/groundingStory";
import { storySoFar } from "./chapterKit";
import type { ChapterHost, ChapterPort } from "./chapterPort";
import { compact, type CompactRow } from "./compactHistory";
import { resolveFeatures } from "./featureResolve";
import { historyNotesPass, type NoteRow } from "./historyNotes";
import type { ManagerPort } from "./managerWiring";
import { sanitizeGlobalSettings } from "./settingsModel";
import { SKIP_COPY } from "./skipGate";
import { createSkipPort } from "./skipPort";
import { SWIPE_CONTRAST_CLEARS, swipeContrast } from "./swipeContrast";

const defaults = () => sanitizeGlobalSettings(undefined);
const offs = () => [sanitizeGlobalSettings({
  extraction: { promiseAddressee: false }, talk: { swipeContrast: false, skipAhead: false },
  memory: { deferredOutOfPrompt: false, historyNotes: false, outwardNarration: false, chapters: { compact: false } },
})];

describe("harvest 2026-10-30 dooms P3: a default-off prompt setting leaves the prompt byte for byte as without the feature", () => {
  it("ships six off; outward narration and history notes ship on since their blind ratings passed", () => {
    expect([defaults().memory.historyNotes, defaults().memory.outwardNarration]).toEqual([true, true]);
    expect([defaults().memory.deferredOutOfPrompt, defaults().memory.chapters?.compact === true, defaults().talk.swipeContrast, defaults().talk.skipAhead])
      .toEqual([false, false, false, false]);
    for (const settings of offs()) {
      expect(settings.extraction).not.toHaveProperty("readLayout");
      expect(settings.extraction).not.toHaveProperty("promiseAddressee");
      expect([settings.memory.deferredOutOfPrompt, settings.memory.historyNotes, settings.memory.outwardNarration, settings.memory.chapters?.compact === true])
        .toEqual([false, false, false, false]);
      expect([settings.talk.swipeContrast, settings.talk.skipAhead]).toEqual([false, false]);
    }
  });

  it("extraction.readLayout + promiseAddressee: the read prompt and contract hash equal the classic golden", async () => {
    const golden = JSON.parse(readFileSync(join(resolve(__dirname, "../../test/goldens/read-prompt"), "classic.json"), "utf-8")) as Array<{ prompt: string; contractHash: string }>;
    for (const settings of [...offs(), sanitizeGlobalSettings({ extraction: { readLayout: "classic", promiseAddressee: "yes" } })]) {
      for (const [index, turn] of READ_LAYOUT_TURNS.entries()) {
        const { audit } = await readLayoutRead(turn, readPromptOptions(settings.extraction));
        expect({ prompt: audit.prompt, contractHash: audit.contractHash }).toEqual(golden[index]);
      }
    }
  });

  it("memory.deferredOutOfPrompt: a put-off thread reaches the story-so-far block exactly as an undeferred one", () => {
    const span = { chatId: "c", messageId: 2, revision: { swipeId: null, hash: "h" }, speaker: "Rin", isUser: true, span: [0, 6] as [number, number] };
    const plain: ArcEntry[] = [
      { id: "a", text: "Who rang the bell at midnight", status: "open", entities: [], openedAt: 1 },
      { id: "b", text: "The debt owed to the river smugglers", status: "open", entities: [], openedAt: 1 },
    ];
    const deferred: ArcEntry[] = [plain[0], { ...plain[1], history: [{ kind: "deferred", boundary: 2, messageId: 3, quote: "Later.", span }] }];
    const story = { id: "s", title: "S", roster: [], chapters: [] } as unknown as NormalizedStory;
    const state = { activeCheckpointId: "c1", lastMessageId: 6, checkpointStartedBoundary: 0, boundary: 3, visitedPath: ["c1"] } as unknown as EngineState;
    const host = (arcs: ArcEntry[], settings: object) => ({
      memory: () => ({ arcs, derived: [], entries: [], chapters: [], settings: { ...settings, enabled: true } }),
      deps: { getStory: () => story, getState: () => state }, coordinator: { injector: { restingFilter: () => (text: string) => text } },
    }) as unknown as ChapterHost;
    const baseline = storySoFar(host(plain, defaults().memory));
    expect(baseline).toContain("smugglers");
    for (const settings of offs()) expect(storySoFar(host(deferred, settings.memory))).toBe(baseline);
    expect(storySoFar(host(deferred, { deferredOutOfPrompt: true }))).not.toBe(baseline);
  });

  it("memory.historyNotes: ST's prompt copy keeps every row untouched on every generation type", () => {
    const story = groundingStory();
    const engine = playGrounding(story, [{ set: { location: "harbor" }, messageId: 1 }, { messageId: 3 }, { set: { story_time: 2 }, messageId: 5 }, { set: { location: "market" }, messageId: 7 }]);
    const live = Array.from({ length: 10 }, (_, index) => ({ mes: `message ${index}`, is_user: index % 2 === 0, extra: {} as Record<string, unknown> }));
    for (const settings of offs()) {
      const pass = historyNotesPass({
        enabled: () => settings.memory.historyNotes === true, chatId: () => "chat", ownedChat: () => "chat", story: () => story, log: () => engine.stateLog,
        live: () => live, resting: () => (text: string) => text,
      });
      for (const type of ["normal", "swipe", "regenerate", "continue"]) {
        const copy: NoteRow[] = live.map((row) => ({ ...row }));
        const before = JSON.stringify(copy);
        expect(pass.apply(copy, type, false)).toBe(0);
        expect(JSON.stringify(copy)).toBe(before);
      }
    }
    const on = historyNotesPass({ enabled: () => true, chatId: () => "chat", ownedChat: () => "chat", story: () => story, log: () => engine.stateLog, live: () => live, resting: () => (text: string) => text });
    expect(on.apply(live.map((row) => ({ ...row })), "normal", false)).toBeGreaterThan(0);
  });

  it("memory.outwardNarration: the narrator's and a member's blocks equal the pre-feature render", () => {
    const voices: CastVoice[] = [{ id: "dm", name: "DM", omniscient: true }, { id: "kael", name: "Kael", motive: "hide the stolen ring", selfVoiced: true }];
    const hiding = { id: "h", subject: "Kael", tag: "hiding", hiddenFrom: "Lyria", content: "the theft", status: "active", source: "extractor", createdAt: 0 } as unknown as EpistemicEntry;
    for (const settings of offs()) {
      const outward = settings.memory.outwardNarration === true;
      expect(memberAimsBlock(voices, "dm", "", [hiding], "", undefined, outward)).toBe(memberAimsBlock(voices, "dm", "", [hiding], ""));
      expect(memberAimsBlock(voices, "kael", "slip away", [hiding], "PRIVATE", undefined, outward)).toBe(memberAimsBlock(voices, "kael", "slip away", [hiding], "PRIVATE"));
      expect(renderNarratorBlock([hiding], voices, "dm", undefined, outward)).toBe(renderNarratorBlock([hiding], voices, "dm"));
    }
    expect(renderNarratorBlock([hiding], voices, "dm", undefined, true)).not.toBe(renderNarratorBlock([hiding], voices, "dm"));
  });

  it("talk.swipeContrast: no block is written or cleared on any generation type or clearing event", () => {
    for (const settings of offs()) {
      const writes: string[] = [];
      const contrast = swipeContrast({
        enabled: () => settings.talk.swipeContrast === true, chatId: () => "chat", ownedChat: () => "chat", rejected: () => "She shrugs and walks off.",
        set: (text) => { writes.push(`set ${text}`); return { ok: true }; }, clear: () => { writes.push("clear"); },
      });
      for (const type of ["swipe", "normal", "regenerate", "continue", "quiet", "impersonate"]) expect(contrast.arm(type, false)).toBe(false);
      for (const event of SWIPE_CONTRAST_CLEARS) contrast.onEvent(event, false);
      expect(writes).toEqual([]);
    }
    const planted: string[] = [];
    swipeContrast({ enabled: () => true, chatId: () => "chat", ownedChat: () => "chat", rejected: () => "x", set: (text) => { planted.push(text); return { ok: true }; }, clear: () => {} }).arm("swipe", false);
    expect(planted).toHaveLength(1);
  });

  it("memory.chapters.compact: the interceptor leaves every row, adds no marker and journals nothing", () => {
    const live = Array.from({ length: 200 }, () => ({ extra: {} as Record<string | symbol, unknown> }));
    for (const settings of offs()) {
      const rows: CompactRow[] = live.map((entry, index) => ({ mes: `m${index} ${"word ".repeat(30)}`, extra: entry.extra }));
      const before = rows.map((row) => [row.mes, Reflect.ownKeys(row.extra as object).length]);
      const journal = jest.fn();
      const port = { compactedTo: null, host: { memory: () => ({ settings: { ...settings.memory, enabled: true }, shortTermSummaryEnd: 199 }), deps: { chapterHost: { journal } } } } as unknown as ChapterPort;
      expect(compact(port, rows, "normal", live, 2000, 199)).toBeNull();
      expect(rows.map((row) => [row.mes, Reflect.ownKeys(row.extra as object).length])).toEqual(before);
      expect(journal).not.toHaveBeenCalled();
      expect(port.compactedTo).toBeNull();
    }
    const rows: CompactRow[] = live.map((entry, index) => ({ mes: `m${index} ${"word ".repeat(30)}`, extra: entry.extra }));
    const onPort = { compactedTo: null, host: { memory: () => ({ settings: { enabled: true, chapters: { compact: true } }, shortTermSummaryEnd: 199 }), deps: { chapterHost: { journal: jest.fn() } } } } as unknown as ChapterPort;
    expect(compact(onPort, rows, "normal", live, 2000, 199)?.compacted).toBeGreaterThan(0);
  });

  it("talk.skipAhead: the feature resolves off, the card offers nothing and a /story skip arms no direction", async () => {
    const story = parseStoryOrThrow({
      title: "Skip", description: "", roster: [{ id: "narrator", name: "Narrator", view: "omniscient" }],
      qualities: [{ key: "left", type: "bool", source: "extractor", rubric: "Left?" }],
      checkpoints: [{ id: "a", name: "A", type: "anchor", start: true, objective: "o" }],
      transitions: [],
    });
    for (const settings of offs()) expect(resolveFeatures(settings, story).skip.enabled).toBe(false);
    expect(resolveFeatures(sanitizeGlobalSettings({ talk: { skipAhead: true } }), story).skip.enabled).toBe(true);
    const direct = jest.fn(() => null);
    const untouched = new Proxy({}, { get: () => { throw new Error("skip off touched the host"); } });
    const port = { loaded: () => ({ story }), extras: () => ({ overrides: {} }), engine: untouched, view: untouched, lifecycle: untouched, journal: untouched } as unknown as ManagerPort;
    const skip = createSkipPort(port, { direct, speech: untouched as never, outcomePending: () => false });
    expect(skip.view()).toBeNull();
    expect(await skip.run()).toEqual({ ok: false, reason: SKIP_COPY.off });
    expect(direct).not.toHaveBeenCalled();
  });
});
