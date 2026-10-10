import * as sagaMini from "../../test/fixtures/chapters-mini.story.json";
import * as corpus from "../../test/measurements/v2.6-07/saga-mini.story.json";
import { parseStoryV2, parseStoryV2OrThrow, type StoryV2 } from "@engine/index";
import type { ChapterRecord } from "@memory/types";
import { runDiagnostics } from "../studio/diagnostics";
import { addChapter, removeChapter, setChapterPolicy, setCheckpointChapter } from "../studio/mutations";
import { buildChapterView, chapterNumber, chapterSettings, DEFAULT_CHAPTER_SETTINGS, jumpSeal, liveSkip, sealRange, sealTarget } from "./chapters";

const raw = () => JSON.parse(JSON.stringify({ ...sagaMini, default: undefined })) as StoryV2;
const story = parseStoryV2OrThrow(raw());

const sealed = (chapterId: string, pathLength: number, patch: Partial<ChapterRecord> = {}) => ({
  id: `${chapterId}-1`, chapterId, playerTitle: chapterId, range: { from: 0, to: 9 }, sealedAt: { boundary: 1, messageId: 9, at: 0, pathLength }, ...patch,
}) as Partial<ChapterRecord> as ChapterRecord;

describe("seal target on the chapters-mini graph", () => {
  it.each([
    ["inside the first chapter", ["gate", "market"], [], null],
    ["on entering the interlude", ["gate", "market", "fire"], [], "arrival"],
    ["missed in the interlude, caught in the next chapter", ["gate", "market", "fire", "walls"], [], "arrival"],
    ["already sealed", ["gate", "market", "fire", "walls"], [sealed("arrival", 3)], null],
  ])("%s", (_label, path, records, expected) => {
    const target = sealTarget(story, path[path.length - 1], records, path);
    expect(target?.chapter.id ?? null).toBe(expected);
    if (target) expect(target).toMatchObject({ part: 1, final: false });
  });

  it("seals the final chapter at the ending, and nothing after the story ended", () => {
    const path = ["gate", "market", "fire", "walls", "dawn"];
    expect(sealTarget(story, "dawn", [sealed("arrival", 3)], path)).toMatchObject({ chapter: { id: "siege" }, final: true });
    expect(sealTarget(story, "dawn", [sealed("arrival", 3), sealed("siege", 5, { final: true })], path)).toBeNull();
  });

  it("does nothing for a story without chapters", () => {
    const plain = raw();
    delete plain.chapters;
    plain.checkpoints.forEach((checkpoint) => delete checkpoint.chapter);
    expect(sealTarget(parseStoryV2OrThrow(plain), "fire", [], ["gate", "market", "fire"])).toBeNull();
  });

  it("ranges start after the previous record and numbers skip interludes", () => {
    expect(sealRange([], 2, 9)).toEqual({ from: 2, to: 9 });
    expect(sealRange([sealed("arrival", 3)], 0, 20)).toEqual({ from: 10, to: 20 });
    expect(chapterNumber(story, "siege")).toBe(2);
    expect(chapterNumber(story, "camp")).toBe(0);
  });

  it("defaults every feature on (owner decision 2026-10-09), with the 700-token arm", () => {
    expect(chapterSettings(undefined)).toEqual(DEFAULT_CHAPTER_SETTINGS);
    expect(DEFAULT_CHAPTER_SETTINGS).toMatchObject({ seal: true, storySoFar: true, fold: true, recap: true, archiveRecall: true, eraSeals: true, foldEras: true, chronicleTokens: 700 });
  });

  it("views the current chapter and the sealed records", () => {
    const view = buildChapterView(story, "walls", [sealed("arrival", 3)]);
    expect(view?.current?.id).toBe("siege");
    expect(view?.records.map((item) => item.id)).toEqual(["arrival-1"]);
  });
});

describe("/cp activate across a chapter (D2: sealed only when the author confirms)", () => {
  it("names the chapter a jump would leave, skipping back over an interlude, and nothing inside one chapter", () => {
    expect(jumpSeal(story, { activeCheckpointId: "market", visitedPath: ["gate", "market"] }, [], "walls")?.chapter.id).toBe("arrival");
    expect(jumpSeal(story, { activeCheckpointId: "fire", visitedPath: ["gate", "market", "fire"] }, [], "walls")?.chapter.id).toBe("arrival");
    expect(jumpSeal(story, { activeCheckpointId: "gate", visitedPath: ["gate"] }, [], "market")).toBeNull();
    expect(jumpSeal(story, { activeCheckpointId: "market", visitedPath: ["gate", "market"] }, [], "nowhere")).toBeNull();
    expect(jumpSeal(story, { activeCheckpointId: "market", visitedPath: ["gate", "market"] }, [sealed("arrival", 3)], "walls")).toBeNull();
  });

  it("a declined seal is not taken later by the automatic trigger, and a later chapter still seals", () => {
    const path = ["gate", "market", "walls"];
    expect(sealTarget(story, "walls", [], path)?.chapter.id).toBe("arrival");
    expect(sealTarget(story, "walls", [], path, 3)).toBeNull();
    expect(sealTarget(story, "dawn", [], [...path, "dawn"], 3)).toMatchObject({ chapter: { id: "siege" }, final: true });
  });

  it("a skip marker counts only while the path still reaches it", () => {
    expect(liveSkip({ pathLength: 3, messageId: 7 }, 3)).toBe(3);
    expect(liveSkip({ pathLength: 3, messageId: 7 }, 2)).toBeNull();
    expect(liveSkip(null, 5)).toBeNull();
  });
});

describe("chapter validation", () => {
  it("indexes checkpoints by chapter", () => {
    expect(story.chapterByCheckpoint).toMatchObject({ gate: "arrival", fire: "camp", dawn: "siege" });
  });

  it("refuses a missing, an unknown and a duplicate chapter", () => {
    const broken = raw();
    delete broken.checkpoints[1].chapter;
    broken.checkpoints[2].chapter = "nowhere";
    broken.chapters!.push({ id: "arrival", title: "Again" });
    const errors = parseStoryV2(broken);
    expect(Array.isArray(errors) ? errors.map((error) => error.message) : []).toEqual(expect.arrayContaining([
      "every checkpoint needs a chapter once chapters are declared", "unknown chapter 'nowhere'", "duplicate chapter 'arrival'",
    ]));
  });

  it("refuses an unknown seal policy", () => {
    const broken = raw();
    broken.chapters![0].seal = { open_threads: "maybe" } as never;
    const errors = parseStoryV2(broken);
    expect(Array.isArray(errors) && errors.some((error) => error.path === "chapters.0.seal.open_threads")).toBe(true);
  });
});

describe("chapter diagnostics and mutations", () => {
  const codes = (draft: StoryV2) => runDiagnostics(draft).map((item) => item.code).filter((code) => /chapter|dead-end/.test(code));

  it("finds nothing on the fixture or on the Q-M corpus story", () => {
    expect(codes(raw())).toEqual([]);
    const saga = JSON.parse(JSON.stringify({ ...corpus, default: undefined })) as StoryV2;
    expect(codes(saga)).toEqual([]);
    expect(parseStoryV2OrThrow(saga).checkpoints).toHaveLength(14);
  });

  it("names a chapter with no exit and the dead end it leaves", () => {
    expect(codes(setChapterPolicy({ ...raw(), chapters: raw().chapters!.map((chapter) => ({ ...chapter, final: false })) }, "siege", {}))).toEqual(["chapter-no-exit", "story-dead-end"]);
  });

  it("leaves the living frontier alone: the anchor the director continues from is no dead end", () => {
    const open = { ...raw(), chapters: raw().chapters!.map((chapter) => ({ ...chapter, final: false })) };
    const ends = open.checkpoints.filter((checkpoint) => !open.transitions.some((transition) => transition.from === checkpoint.id)).map((checkpoint) => checkpoint.id);
    expect(codes({ ...open, living: { premise: "p", authored_until: ends[0] } })).toEqual([]);
    expect(codes({ ...open, living: { premise: "p", authored_until: "elsewhere" } })).toEqual(["chapter-no-exit", "story-dead-end"]);
  });

  it("names a re-entry, an unreachable chapter and a checkpoint with no chapter", () => {
    const draft = raw();
    draft.transitions.push({ from: "walls", to: "gate", priority: 0, gate: { all: [] } });
    const extra = addChapter(draft, { id: "lost", title: "Lost", final: true });
    const withCheckpoint = { ...extra, checkpoints: [...extra.checkpoints, { id: "void", name: "Void", objective: "", type: "anchor" as const }] };
    const tagged = setCheckpointChapter(withCheckpoint, "void", "lost");
    expect(codes(tagged)).toEqual(expect.arrayContaining(["chapter-unreachable", "chapter-reentry"]));
    expect(codes(setCheckpointChapter(tagged, "void", ""))).toContain("chapter-missing");
  });

  it("removing a chapter clears it from its checkpoints", () => {
    const draft = removeChapter(raw(), "camp");
    expect(draft.checkpoints.find((checkpoint) => checkpoint.id === "fire")?.chapter).toBeUndefined();
    expect(draft.chapters?.map((chapter) => chapter.id)).toEqual(["arrival", "siege"]);
    expect(codes(draft)).toContain("chapter-missing");
  });
});
