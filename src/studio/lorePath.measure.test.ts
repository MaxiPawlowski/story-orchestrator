import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Story } from "@engine/index";
import { estimateTokens } from "@extraction/callBudget";
import { LORE_PATH_BUDGET_TOKENS, lorePathPeak, storyLoreBooks, type LoreTokenEntry } from "./loreDiagnostics";

const root = join(__dirname, "../..");
const pin = JSON.parse(readFileSync(join(root, "scripts/debug/adolion-fresh.pin.json"), "utf8")) as { repo: string; commit: string };
const repo = process.env.ADOLION_CAMPAIGN || pin.repo;
const git = (args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

type Book = { entries: Record<string, { comment?: string; content?: string; disable?: boolean; constant?: boolean }> };
const rows = (book: Book | null): LoreTokenEntry[] | null => (book
  ? Object.values(book.entries).map((entry) => ({ comment: entry.comment ?? "", tokens: estimateTokens(entry.content ?? ""), disabled: entry.disable === true, constant: entry.constant === true }))
  : null);

const measure = (story: Story, book: (name: string) => Book | null) => {
  const entries = (name: string) => rows(book(name)) ?? [];
  const before = lorePathPeak(story, entries, false)?.tokens ?? 0;
  const after = lorePathPeak(story, entries, true)?.tokens ?? 0;
  const allBefore = lorePathPeak(story, entries, false, "all")?.tokens ?? 0;
  const allAfter = lorePathPeak(story, entries, true, "all")?.tokens ?? 0;
  return { before, after, allBefore, allAfter, books: storyLoreBooks(story).length };
};

const campaign = (): Array<{ story: Story; book: (name: string) => Book | null }> => {
  if (!existsSync(repo)) return [];
  try {
    const listed = git(["ls-tree", "--name-only", pin.commit, "build/story/"]).split(/\r?\n/).filter((path) => path.endsWith(".story.json"));
    const books = new Set(git(["ls-tree", "--name-only", pin.commit, "build/lorebooks/"]).split(/\r?\n/));
    const cache = new Map<string, Book | null>();
    const book = (name: string): Book | null => {
      const path = `build/lorebooks/${name}.json`;
      if (!cache.has(path)) cache.set(path, books.has(path) ? JSON.parse(git(["show", `${pin.commit}:${path}`])) as Book : null);
      return cache.get(path) ?? null;
    };
    return listed.map((path) => ({ story: JSON.parse(git(["show", `${pin.commit}:${path}`])) as Story, book }));
  } catch {
    return [];
  }
};

describe("lore lifetime: worst-case lore along a path, before and after (v3.0 43 L1)", () => {
  it("sun-ruins example (no chapters: lifetimes change nothing without until)", () => {
    const story = JSON.parse(readFileSync(join(root, "examples/sun-ruins/quest-for-the-sun-ruins.json"), "utf8")) as Story;
    const book = JSON.parse(readFileSync(join(root, "examples/sun-ruins/Xentar Checkpoints.json"), "utf8")) as Book;
    const result = measure(story, () => book);
    process.stdout.write(`\nL1 sun-ruins worst-path tokens: ${JSON.stringify(result)}\n`);
    expect(result.after).toBe(result.before);
  });

  it("pinned campaign stories, by index only (counts, no names)", () => {
    const results = campaign().map(({ story, book }, index) => ({ story: `S${index + 1}`, ...measure(story, book) }));
    const over = (key: "before" | "after") => results.filter((row) => row[key] > LORE_PATH_BUDGET_TOKENS).length;
    process.stdout.write(`\nL1 campaign worst-path tokens: ${JSON.stringify({ results, overBefore: over("before"), overAfter: over("after"), budget: LORE_PATH_BUDGET_TOKENS })}\n`);
    for (const row of results) expect(row.after).toBeLessThanOrEqual(row.before);
  });
});
