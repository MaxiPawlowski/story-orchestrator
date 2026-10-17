jest.mock("@services/STAPI", () => ({ getContext: () => ({}), saveOpenChat: jest.fn() }));

import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseStoryV2 } from "@engine/index";
import { loadGameLayer } from "@engine/validate/gameLayer";
import { BLOB_VERSION } from "./persistence";
import { TROPHY_SHELF_MAX, shelfCandidates, trophyFromBlob } from "./trophyShelf";
import type { ContinueRow } from "./playsIndex";
import { TrophyShelf } from "../components/carry/TrophyShelf";

const SOURCE_RAW = {
  ...(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/carry-source.story.json"), "utf8")) as Record<string, unknown>),
  milestones: [
    { id: "lit", title: "Relit the harbour light", when: { q: "coast_fate", op: "==", v: "lit" } },
    { id: "rich", title: "Came away with coin", when: { q: "coins", op: ">=", v: 3 } },
    { id: "pact", title: "Swore the drowned pact", when: { q: "secret_pact", op: "==", v: "sworn" }, secret: true },
    { id: "dark", title: "Let the coast go dark", when: { q: "coast_fate", op: "==", v: "dark" } },
  ],
};
const OPTIONS = { version: BLOB_VERSION, parse: parseStoryV2 };
const END: Record<string, unknown> = { met_guild: true, coast_fate: "lit", harbour_mood: "bitter", coins: 4, secret_pact: "sworn" };

const record = (id: string, extra: Record<string, unknown> = {}) => ({
  id, chapterId: id, playerTitle: id === "light" ? "The Last Lantern" : "The Dark Harbour", short: `${id} short.`, summary: "s", blackboardAt: END,
  sealedAt: { boundary: 4, messageId: 9, at: Date.UTC(2026, 9, 1), pathLength: 2 }, epilogue: "EPILOGUE TEXT NEVER SHOWN", ...extra,
});

interface BlobOptions {
  chatId: string;
  final?: boolean;
  values?: Record<string, unknown>;
  epistemic?: unknown[];
  version?: number;
  pinned?: Record<string, unknown>;
  playerTitle?: string;
}

const blob = ({ chatId, final = true, values = END, epistemic = [], version = BLOB_VERSION, pinned = SOURCE_RAW, playerTitle }: BlobOptions) => ({
  version, chatId, selectedStoryId: "ngp-source",
  stories: {
    "ngp-source": {
      storyId: "ngp-source", pinnedStory: { ...pinned, id: "ngp-source" }, contentHashAtLoad: `hash-${chatId}`, engineState: { activeCheckpointId: "tower" },
      extras: {
        memory: {
          epistemic,
          chapters: [record("coast"), record("light", { blackboardAt: values, ...(final ? { final: true } : {}), ...(playerTitle ? { playerTitle } : {}) })],
        },
      },
    },
  },
});

const row = (chatId: string, updatedAt: string, ended = true): ContinueRow => ({
  chatId, storyId: "ngp-source", title: "Lanterns", groupId: "g", checkpointName: null, kind: "story", updatedAt, ...(ended ? { ended: true as const } : {}),
});

beforeAll(async () => { await loadGameLayer(); });

describe("v2.8 plan 45 E (M45e): the trophy shelf lists verified ended runs only", () => {
  it("T1: of 10 index-ended chats exactly the 5 valid runs are shown; rows the index does not mark ended are never read; at most 20", () => {
    const blobs: Record<string, unknown> = {};
    const rows: ContinueRow[] = [];
    ["v1", "v2", "v3", "v4", "v5"].forEach((chatId, index) => { rows.push(row(chatId, `2026-10-0${index + 1}T00:00:00.000Z`)); blobs[chatId] = blob({ chatId }); });
    rows.push(row("n1", "2026-10-06T00:00:00.000Z"), row("n2", "2026-10-06T00:00:00.000Z"));
    blobs.n1 = blob({ chatId: "n1", final: false });
    blobs.n2 = blob({ chatId: "n2", final: false });
    rows.push(row("w1", "2026-10-07T00:00:00.000Z"));
    blobs.w1 = blob({ chatId: "w1", version: BLOB_VERSION - 1 });
    rows.push(row("p1", "2026-10-07T00:00:00.000Z"));
    blobs.p1 = blob({ chatId: "p1", pinned: { ...SOURCE_RAW, checkpoints: [] } });
    rows.push(row("x1", "2026-10-08T00:00:00.000Z"));
    blobs.x1 = blob({ chatId: "other-chat" });
    rows.push(row("open", "2026-10-09T00:00:00.000Z", false));
    blobs.open = blob({ chatId: "open" });
    const candidates = shelfCandidates(rows);
    expect(candidates).not.toContain("open");
    const shown = candidates.filter((chatId) => trophyFromBlob(blobs[chatId], chatId, OPTIONS).ok);
    expect(shown.sort()).toEqual(["v1", "v2", "v3", "v4", "v5"]);
    expect(trophyFromBlob(blobs.n1, "n1", OPTIONS)).toEqual({ ok: false, reason: "the run has not ended" });
    const many = Array.from({ length: 30 }, (_, index) => row(`c${index}`, `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`));
    expect(shelfCandidates(many)).toHaveLength(TROPHY_SHELF_MAX);
    expect(shelfCandidates(many)[0]).toBe("c29");
  });

  it("T2: a row holds the ending title and only earned, non-secret milestones, never values or the epilogue", () => {
    const result = trophyFromBlob(blob({ chatId: "v1" }), "v1", OPTIONS);
    expect(result).toEqual({ ok: true, row: {
      chatId: "v1", storyTitle: JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/carry-source.story.json"), "utf8")).title,
      endingTitle: "The Last Lantern", endedAt: "2026-10-01T00:00:00.000Z", milestones: ["Relit the harbour light", "Came away with coin"],
    } });
    const text = JSON.stringify(result);
    ["EPILOGUE", "sworn", "bitter", "Swore the drowned pact", "coins"].forEach((needle) => expect(text).not.toContain(needle));
  });

  it("T2 property: over 300 random endings no secret or unearned milestone title reaches a row", () => {
    let leaks = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const values: Record<string, unknown> = {
        coast_fate: seed % 3 === 0 ? "dark" : seed % 3 === 1 ? "lit" : "kept", coins: seed % 6, secret_pact: seed % 2 ? "sworn" : "refused",
      };
      const result = trophyFromBlob(blob({ chatId: `s${seed}`, values }), `s${seed}`, OPTIONS);
      if (!result.ok) { leaks += 1; continue; }
      const earned = [
        values.coast_fate === "lit" ? "Relit the harbour light" : null, (values.coins as number) >= 3 ? "Came away with coin" : null, values.coast_fate === "dark" ? "Let the coast go dark" : null,
      ].filter(Boolean);
      if (JSON.stringify(result.row.milestones) !== JSON.stringify(earned)) leaks += 1;
      if (result.row.milestones.includes("Swore the drowned pact")) leaks += 1;
    }
    expect(leaks).toBe(0);
  });

  it("T3: an ending title or milestone that restates a held secret is dropped; otherwise the row is byte-identical with and without the secret", () => {
    const secret = { id: "e1", subject: "Tom", tag: "hiding", content: "Tom relit the harbour light in secret for the smugglers", hiddenFrom: "Mara", createdAt: 1 };
    const plain = trophyFromBlob(blob({ chatId: "h1" }), "h1", OPTIONS);
    const unrelated = trophyFromBlob(blob({ chatId: "h1", epistemic: [{ ...secret, content: "Tom keeps a second ledger under the floor of the boathouse" }] }), "h1", OPTIONS);
    expect(JSON.stringify(unrelated)).toBe(JSON.stringify(plain));
    const held = trophyFromBlob(blob({ chatId: "h1", epistemic: [secret], playerTitle: "Tom relit the harbour light in secret for the smugglers" }), "h1", OPTIONS);
    expect(held.ok && held.row.endingTitle).toBe("");
  });

  it("T4: the shelf renders nothing without an ended row, and shows verified rows with their milestones once opened", async () => {
    const quiet = renderToStaticMarkup(createElement(TrophyShelf, { rows: [row("a", "2026-10-01T00:00:00.000Z", false)], load: async () => [] }));
    expect(quiet).toBe("");
    const shut = renderToStaticMarkup(createElement(TrophyShelf, { rows: [row("a", "2026-10-01T00:00:00.000Z")], load: async () => [] }));
    expect(shut).toContain("Finished stories");
    expect(shut).not.toContain("trophy-row");
  });
});
