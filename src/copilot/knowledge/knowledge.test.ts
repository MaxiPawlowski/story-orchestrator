import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { FEATURES } from "@features/registry";
import { GUIDE_PAGES } from "@guide/pages.generated";
import { GUIDE_TOPIC_IDS } from "../guideTopics";
import {
  ALL_AUDIENCES, featureTopicText, findTopic, isCoveredElsewhere, knowledgeTopics, pageSections, PLAYER_AUDIENCES, readKnowledge, searchKnowledge, searchTopics,
  ST_TOPICS, TOPIC_CHARS, topicsFor,
} from "./index";

const ROOT = resolve(__dirname, "../../..");

const stRoot = (): string | null => {
  const fromEnv = String(process.env.ST_ROOT ?? "").trim();
  if (fromEnv) return resolve(fromEnv);
  const file = join(ROOT, ".st-root");
  if (!existsSync(file)) return null;
  const configured = readFileSync(file, "utf8").trim();
  return configured ? resolve(ROOT, configured) : null;
};

const ST_ROOT = stRoot();
const withHost = ST_ROOT && existsSync(join(ST_ROOT, "src", "plugin-loader.js")) ? describe : describe.skip;

const filesUnder = (dir: string): string[] => (existsSync(dir)
  ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : entry.name.endsWith(".md") ? [join(dir, entry.name)] : []))
  : []);

const RUN = 10;

const runs = (text: string): string[] => {
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.slice(0, Math.max(0, tokens.length - RUN + 1)).map((_, index) => tokens.slice(index, index + RUN).join(" "));
};

describe("v2.8 09 A: the shipped knowledge base", () => {
  it("gives every topic a unique id, a title, text within the cap, an audience, a source and a since", () => {
    const topics = knowledgeTopics();
    const ids = topics.map((topic) => topic.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    const bad = topics.filter((topic) => !topic.title || !topic.text || topic.text.length > TOPIC_CHARS + 1 || !ALL_AUDIENCES.includes(topic.audience) || !topic.source || !topic.since);
    expect(bad.map((topic) => topic.id)).toEqual([]);
  });

  it("plugin topics: every registry feature is a topic with its own text and audience", () => {
    const drift = FEATURES.filter((feature) => {
      const topic = findTopic(`feature/${feature.id}`, ALL_AUDIENCES);
      return !topic || topic.text !== featureTopicText(feature) || topic.audience !== feature.audience || topic.title !== feature.name;
    });
    expect(drift.map((feature) => feature.id)).toEqual([]);
    expect(knowledgeTopics().filter((topic) => topic.family === "feature")).toHaveLength(FEATURES.length);
  });

  it("plugin topics: every guide page is covered, section by section, at the page's own audience", () => {
    const missing = GUIDE_PAGES.filter((page) => !isCoveredElsewhere(page) && !knowledgeTopics().some((topic) => topic.source === `docs/guide/${page.doc}`));
    expect(missing.map((page) => page.id)).toEqual([]);
    const split = GUIDE_PAGES.filter((page) => pageSections(page).some((section, index) => index > 0 && !section.slug));
    expect(split.map((page) => page.id)).toEqual([]);
    const audience = knowledgeTopics().filter((topic) => topic.family === "guide" && GUIDE_PAGES.find((page) => `docs/guide/${page.doc}` === topic.source)?.audience !== topic.audience);
    expect(audience.map((topic) => topic.id)).toEqual([]);
  });

  it("plugin and author topics cite a repo file that exists", () => {
    const cited = knowledgeTopics().filter((topic) => topic.family !== "st").flatMap((topic) => [...topic.source.matchAll(/((?:docs|src)\/[\w./-]+\.(?:md|ts))/g)].map((match) => match[1]));
    expect(cited.length).toBeGreaterThan(0);
    expect([...new Set(cited)].filter((path) => !existsSync(join(ROOT, path)))).toEqual([]);
  });

  it("author topics: one per author's guide topic", () => {
    expect(knowledgeTopics().filter((topic) => topic.family === "author").map((topic) => topic.id)).toEqual(GUIDE_TOPIC_IDS.map((id) => `author/${id}`));
  });

  it("SillyTavern topics are never player topics and each cites at least one host file", () => {
    expect(ST_TOPICS.filter((topic) => (topic.audience as string) === "player" || !topic.sources.length).map((topic) => topic.id)).toEqual([]);
    expect(topicsFor(PLAYER_AUDIENCES).filter((topic) => topic.family === "st" || topic.family === "author")).toEqual([]);
  });

  it("SillyTavern topics are summarised in our own words: no run of ten words copied from the community corpus", () => {
    const corpus = new Set([...filesUnder(join(ROOT, "docs/tutorials")), ...filesUnder(join(ROOT, ".claude/sillytavern-docs"))].flatMap((file) => runs(readFileSync(file, "utf8"))));
    expect(corpus.size).toBeGreaterThan(1000);
    const copied = ST_TOPICS.flatMap((topic) => runs(topic.text).filter((run) => corpus.has(run)).map((run) => `${topic.id}: ${run}`));
    expect(copied).toEqual([]);
  });

  it("the copy check fails on a copied sentence (control)", () => {
    const sample = readFileSync(filesUnder(join(ROOT, "docs/tutorials"))[0], "utf8");
    const corpus = new Set(runs(sample));
    expect(runs(sample.slice(0, 2000)).some((run) => corpus.has(run))).toBe(true);
  });
});

withHost("v2.8 09 A: SillyTavern topics against the pinned host", () => {
  it("every cited host file exists and still holds the cited anchor", () => {
    const root = ST_ROOT as string;
    const stale = ST_TOPICS.flatMap((topic) => topic.sources.filter((source) => {
      const path = join(root, source.file);
      return !existsSync(path) || !readFileSync(path, "utf8").includes(source.anchor);
    }).map((source) => `${topic.id}: ${source.file} (${source.anchor})`));
    expect(stale).toEqual([]);
  });

  it("the anchor check fails on a renamed anchor (control)", () => {
    const path = join(ST_ROOT as string, ST_TOPICS[0].sources[0].file);
    expect(readFileSync(path, "utf8").includes("so-knowledge-anchor-that-does-not-exist")).toBe(false);
  });
});

describe("v2.8 09 A: readKnowledge and searchKnowledge", () => {
  it("reads a topic by id and refuses an unknown one with a did-you-mean", () => {
    expect(readKnowledge("st/lorebook-activation", ALL_AUDIENCES)).toContain("constant entry is always in context");
    expect(readKnowledge("st/lorebook-activaton", ALL_AUDIENCES)).toContain('did you mean "st/lorebook-activation"?');
    expect(readKnowledge("", ALL_AUDIENCES)).toMatch(/^Name a topic id/);
  });

  it("a player cannot read an author or SillyTavern topic, and is not told it exists", () => {
    const answer = readKnowledge("st/lorebook-activation", PLAYER_AUDIENCES);
    expect(answer).toMatch(/^No topic/);
    expect(answer).not.toContain("st/lorebook-activation\"?");
    expect(readKnowledge("feature/memory", PLAYER_AUDIENCES)).toContain("Story memory");
  });

  it("search finds the always-on lorebook answer and ranks titles first", () => {
    expect(searchTopics("lorebook entry always on constant", ALL_AUDIENCES).map((hit) => hit.topic.id)).toContain("st/lorebook-activation");
    expect(searchKnowledge("author view", ALL_AUDIENCES).split("\n")[0]).toContain("feature/author-view");
    expect(searchKnowledge("zzqx", ALL_AUDIENCES)).toMatch(/^Nothing matches/);
  });

  it("player search returns player topics only", () => {
    const hits = searchTopics("lorebook memory story drawer", PLAYER_AUDIENCES);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.filter((hit) => hit.topic.audience !== "player")).toEqual([]);
  });
});
