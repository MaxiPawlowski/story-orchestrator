jest.mock("@services/STAPI", () => ({ getContext: () => ({}), saveOpenChat: jest.fn() }));

import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2, parseStoryV2OrThrow, questClosedKey, standingKey, type NormalizedStoryV2 } from "@engine/index";
import { sagaOutcomeLines } from "@engine/carry";
import { buildSagaPrompt } from "@memory/chapterRecord";
import { estimateTokens } from "@memory/budget";
import type { ChapterRecord } from "@memory/types";
import { buildCarryState, candidateChats, carryCandidateFromBlob, previouslyText } from "./carryCandidate";
import { PREVIOUSLY_HEADER } from "./carryPort";
import { BLOB_VERSION } from "./persistence";
import { playRow, playRowFromBlob, upsertPlay, type PlaysIndex } from "./playsIndex";

const raw = (name: string) => JSON.parse(readFileSync(join(process.cwd(), `test/fixtures/${name}.story.json`), "utf8")) as Record<string, unknown>;
const SOURCE_RAW = raw("carry-source");
const SOURCE = parseStoryV2OrThrow(SOURCE_RAW);
const SEQUEL = parseStoryV2OrThrow(raw("carry-sequel"));
const OPTIONS = { version: BLOB_VERSION, parse: parseStoryV2 };

const END = {
  met_guild: true, ledger_seen: true, coast_fate: "lit", harbour_mood: "bitter", coins: 4, [questClosedKey("ledger")]: "done", [standingKey("guild")]: -3, secret_pact: "sworn",
};

const record = (id: string, extra: Partial<ChapterRecord> & Record<string, unknown> = {}) => ({
  id, chapterId: id, playerTitle: id === "light" ? "The Last Lantern" : "The Dark Harbour", short: `${id} short line.`, summary: "s", blackboardAt: END,
  sealedAt: { boundary: 4, messageId: 9, at: Date.UTC(2026, 9, 1), pathLength: 2 }, ...extra,
});

interface BlobOptions {
  chatId: string;
  final?: boolean;
  values?: Record<string, unknown>;
  epistemic?: unknown[];
  shorts?: string[];
  story?: string;
}

const blob = ({ chatId, final = true, values = END, epistemic = [], shorts, story = "ngp-source" }: BlobOptions) => ({
  version: BLOB_VERSION, chatId, selectedStoryId: story,
  stories: {
    [story]: {
      storyId: story, storyTitle: SOURCE.title, pinnedStory: { ...SOURCE_RAW, id: story }, contentHashAtLoad: `hash-${chatId}`,
      engineState: { activeCheckpointId: "tower" },
      extras: {
        updatedAt: "2026-10-01T00:00:00.000Z",
        memory: {
          epistemic,
          chapters: [
            record("coast", { short: shorts?.[0] ?? "The harbour went dark one lantern at a time." }),
            record("light", { short: shorts?.[1] ?? "The last lantern burned over the water.", blackboardAt: values, ...(final ? { final: true } : {}) }),
          ],
        },
      },
    },
  },
});

const secretRow = { id: "e1", subject: "Tom", tag: "hiding", content: "Tom swore the drowned pact under the pier at midnight", hiddenFrom: "Mara", createdAt: 1 };

const verified = (plays: PlaysIndex, blobs: Record<string, unknown>, target: NormalizedStoryV2 = SEQUEL): string[] =>
  candidateChats(plays, target.carry_from?.story ?? "", "open").filter((chatId) => carryCandidateFromBlob(blobs[chatId], chatId, target, OPTIONS).ok);

describe("v2.8 plan 45: the picker verifies runs before offering them", () => {
  it("N3: of 10 chats, exactly the 5 ended and valid runs are offered", () => {
    const plays: PlaysIndex = {};
    const blobs: Record<string, unknown> = {};
    const row = (chatId: string, at: string, storyId = "ngp-source") => {
      plays[chatId] = { storyId, title: SOURCE.title, groupId: "g", checkpointName: null, kind: "story", ended: true, updatedAt: at };
    };
    ["v1", "v2", "v3", "v4", "v5"].forEach((chatId, index) => { row(chatId, `2026-10-0${index + 1}T00:00:00.000Z`); blobs[chatId] = blob({ chatId }); });
    ["n1", "n2", "n3"].forEach((chatId) => { row(chatId, "2026-10-08T00:00:00.000Z"); blobs[chatId] = blob({ chatId, final: false }); });
    const { coins: _coins, ...missing } = END;
    row("m1", "2026-10-09T00:00:00.000Z");
    blobs.m1 = blob({ chatId: "m1", values: missing });
    row("o1", "2026-10-09T00:00:00.000Z", "ngp-other");
    blobs.o1 = blob({ chatId: "o1", story: "ngp-other" });
    expect(Object.keys(plays)).toHaveLength(10);
    expect(verified(plays, blobs).sort()).toEqual(["v1", "v2", "v3", "v4", "v5"]);
    expect(carryCandidateFromBlob(blobs.n1, "n1", SEQUEL, OPTIONS)).toEqual({ ok: false, reason: "the run has not ended" });
    expect(carryCandidateFromBlob(blobs.m1, "m1", SEQUEL, OPTIONS)).toEqual({ ok: false, reason: "the run's ending holds no coins" });
    expect(carryCandidateFromBlob(blobs.v1, "v2", SEQUEL, OPTIONS).ok).toBe(false);
    expect(carryCandidateFromBlob({ ...blob({ chatId: "v1" }), version: BLOB_VERSION - 1 }, "v1", SEQUEL, OPTIONS).ok).toBe(false);
  });

  it("never lists the open chat, more than 20 runs, or a row the index does not mark ended", () => {
    const plays: PlaysIndex = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`c${index}`, {
      storyId: "ngp-source", title: "t", groupId: "g", checkpointName: null, kind: "story" as const, ...(index === 3 ? {} : { ended: true as const }), updatedAt: `2026-10-01T00:00:${String(index).padStart(2, "0")}.000Z`,
    }]));
    const chats = candidateChats(plays, "ngp-source", "c24");
    expect(chats).toHaveLength(20);
    expect(chats[0]).toBe("c23");
    expect(chats).not.toContain("c24");
    expect(chats).not.toContain("c3");
  });
});

describe("v2.8 plan 45: the public projection and the pinned copy", () => {
  it("N6: picker row, card, heritage lines and the Previously text are byte-identical with and without a held secret in the source run", () => {
    const plain = carryCandidateFromBlob(blob({ chatId: "a" }), "a", SEQUEL, OPTIONS);
    const held = carryCandidateFromBlob(blob({ chatId: "a", epistemic: [secretRow] }), "a", SEQUEL, OPTIONS);
    if (!plain.ok || !held.ok) throw new Error("both runs verify");
    expect(JSON.stringify(held.candidate)).toBe(JSON.stringify(plain.candidate));
    const left = buildCarryState(SEQUEL, plain.candidate, "t").state;
    const right = buildCarryState(SEQUEL, held.candidate, "t").state;
    expect(JSON.stringify(right)).toBe(JSON.stringify(left));
  });

  it("a chapter line that restates a held secret is left out of the projection", () => {
    const shorts = ["Tom swore the drowned pact under the pier at midnight.", "The last lantern burned over the water."];
    const result = carryCandidateFromBlob(blob({ chatId: "a", epistemic: [secretRow], shorts }), "a", SEQUEL, OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    expect(JSON.stringify(result.candidate)).not.toMatch(/drowned pact/);
    expect(result.candidate.projection.lines).toEqual(["The last lantern burned over the water."]);
  });

  it("N8 at the blob: the projection holds only mapped, public keys", () => {
    const result = carryCandidateFromBlob(blob({ chatId: "a" }), "a", SEQUEL, OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    expect(result.candidate.projection.outcome.map((line) => line.key)).toEqual(["coast_fate", "harbour_mood", "coins", "quest_ledger_closed", "rep_guild"]);
    expect(JSON.stringify(result.candidate)).not.toMatch(/secret_pact|sworn|pact_hidden|tension/);
  });

  it("N11: the pinned copy does not change when the source run is edited, rolled back or deleted afterwards", () => {
    const source = blob({ chatId: "a" });
    const result = carryCandidateFromBlob(source, "a", SEQUEL, OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    const { state } = buildCarryState(SEQUEL, result.candidate, "t");
    const before = JSON.stringify(state);
    const pinned = source.stories["ngp-source"];
    pinned.extras.memory.chapters.pop();
    (pinned.pinnedStory as Record<string, unknown>).title = "Renamed";
    result.candidate.projection.outcome.splice(0);
    result.candidate.projection.storyTitle = "Changed";
    delete (source.stories as Record<string, unknown>)["ngp-source"];
    expect(JSON.stringify(state)).toBe(before);
  });

  it("N5 size: the Previously block stays within 350 tokens, keeps the ending and the heritage lines, and cuts at a sentence", () => {
    const long = Array.from({ length: 60 }, (_, index) => `Night ${index} passed quietly over the harbour wall.`).join(" ");
    const result = carryCandidateFromBlob(blob({ chatId: "a", shorts: [long, long] }), "a", SEQUEL, OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    const { state } = buildCarryState(SEQUEL, result.candidate, "t");
    const block = `${PREVIOUSLY_HEADER}\n${state.previously ?? ""}`;
    expect(estimateTokens(block)).toBeLessThanOrEqual(350);
    expect(state.previously).toMatch(/^"The Lantern Coast" ended with "The Last Lantern"\. You relit the Lantern Coast\. The keeper's ledger: done\. Coins: 4\./);
    expect(state.previously?.endsWith(".")).toBe(true);
    expect(previouslyText({ storyTitle: "T", endingTitle: "", outcome: [], lines: [] }, [])).toBe("\"T\" has ended.");
    const off = buildCarryState(parseStoryV2OrThrow({ ...raw("carry-sequel"), carry_from: { ...(raw("carry-sequel").carry_from as object), previously: false } }), result.candidate, "t");
    expect(off.state.previously).toBeNull();
  });
});

describe("v2.8 plan 45: the ended hint and the epilogue input", () => {
  it("N12: ended is set at the final seal and cleared when a rollback or a restart takes the final record away", () => {
    const view = { story: SOURCE, storyId: "ngp-source", activeCheckpointId: "tower", groupId: "g" };
    const ended = playRow({ ...view, ended: true });
    expect(ended.ended).toBe(true);
    const plays = upsertPlay({}, "c", ended, "2026-10-01T00:00:00.000Z").plays;
    const cleared = upsertPlay(plays, "c", playRow({ ...view, ended: false }), "2026-10-02T00:00:00.000Z");
    expect(cleared.changed).toBe(true);
    expect(cleared.plays.c.ended).toBeUndefined();
    expect(playRowFromBlob(blob({ chatId: "c" }), "c", "g", "2026-10-01T00:00:00.000Z")?.ended).toBe(true);
    expect(playRowFromBlob(blob({ chatId: "c", final: false }), "c", "g", "2026-10-01T00:00:00.000Z")?.ended).toBeUndefined();
  });

  it("N13 golden: the saga prompt carries declared public labels only; the planted secret value is absent", () => {
    const prompt = buildSagaPrompt(SOURCE.title, [], sagaOutcomeLines(SOURCE, END));
    expect(prompt).toBe([
      "Write plain TEXT ONLY. Do NOT continue the roleplay. The story below has ended; write its epilogue.",
      "Write 400-700 words, past tense, drawing only on the chapter records and how it ended. Keep every name as written. Invent nothing.",
      "",
      "STORY: The Lantern Coast",
      "",
      "HOW IT ENDED (what the player saw):",
      "- You relit the Lantern Coast.",
      "- The harbour remembers you bitterly.",
      "- Coins: 4",
      "- The keeper's ledger: done",
      "- The Lamplighters: Wary",
    ].join("\n"));
    expect(prompt).not.toMatch(/sworn|secret_pact|-3/);
    expect(buildSagaPrompt("Untold", [], sagaOutcomeLines(SEQUEL, END))).not.toMatch(/HOW IT ENDED|FINAL STATE/);
  });
});
