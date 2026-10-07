import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FEATURES, authorGuideDoc } from "@features/registry";
import { GUIDE_TOPIC_IDS } from "@copilot/guideTopics";
import { GUIDE_PAGES } from "./pages.generated";
import { GuideMarkdown } from "./GuideMarkdown";
import { docToId, normalizePath, resolveLink, slugify, targetForDoc } from "./links";
import { groupPages, indexPages, searchGuide, visiblePages } from "./search";
import { requestGuide, onGuideRequest } from "./request";
import type { GuidePage } from "./types";

const PAGES: readonly GuidePage[] = GUIDE_PAGES;
const ids = new Set(PAGES.map((page) => page.id));
const HOME = "https://github.com/o/r";

describe("in-plugin guide", () => {
  it("every registry feature and author topic points at a bundled page", () => {
    const missing = [...FEATURES.map((feature) => feature.doc), ...GUIDE_TOPIC_IDS.map(authorGuideDoc)]
      .filter((doc) => !ids.has(targetForDoc(doc).id));
    expect(missing).toEqual([]);
  });

  it("every page renders without raw HTML and every heading gets the slug the bundle recorded", () => {
    for (const page of PAGES) {
      const html = renderToStaticMarkup(createElement(GuideMarkdown, { doc: page.doc, body: page.body, homePage: HOME, onNavigate: () => undefined }));
      expect(html).not.toMatch(/<script|onerror=|<img/i);
      const rendered = [...html.matchAll(/id="so-guide-h-([^"]*)"/g)].map((match) => match[1]);
      expect(rendered).toEqual(page.headings.map((heading) => heading.slug));
    }
  });

  it("resolves page links, sends links outside the guide to GitHub and refuses other schemes", () => {
    expect(resolveLink("player/playing.md", "../setup/judge.md#keys", HOME)).toEqual({ kind: "page", target: { id: "setup/judge", anchor: "keys" } });
    expect(resolveLink("player/playing.md", "#restart", HOME)).toEqual({ kind: "page", target: { id: "player/playing", anchor: "restart" } });
    expect(resolveLink("README.md", "../dev/contributing.md", HOME)).toEqual({ kind: "external", url: `${HOME}/blob/master/docs/dev/contributing.md` });
    expect(resolveLink("README.md", "javascript:alert(1)", HOME)).toEqual({ kind: "none" });
    expect(resolveLink("README.md", "//evil.example", HOME)).toEqual({ kind: "none" });
    expect(resolveLink("README.md", "https://example.com", HOME)).toEqual({ kind: "external", url: "https://example.com" });
    expect(normalizePath("author/topics/../wizard.md")).toBe("author/wizard.md");
    expect(docToId("setup/images.md")).toBe("setup/images");
    expect(slugify("The `/story` command")).toBe("the-story-command");
  });

  it("hides author pages in player mode and finds pages by title first", () => {
    expect(visiblePages(PAGES, false).some((page) => page.audience === "author")).toBe(false);
    expect(groupPages(visiblePages(PAGES, true)).map((group) => group.audience)).toEqual(["player", "setup", "author"]);
    const hits = searchGuide(indexPages(visiblePages(PAGES, false)), "memory model");
    expect(hits[0]?.page.id).toBe("setup/memory-model");
    expect(searchGuide(indexPages(PAGES), "zzqx-nothing")).toEqual([]);
  });

  it("a request reaches the listener with the page and anchor, and reports when nobody listens", () => {
    expect(requestGuide("player/memory.md")).toBe(false);
    const seen: unknown[] = [];
    const stop = onGuideRequest((target) => seen.push(target));
    expect(requestGuide("player/playing.md#restart")).toBe(true);
    expect(requestGuide()).toBe(true);
    stop();
    expect(seen).toEqual([{ id: "player/playing", anchor: "restart" }, null]);
  });
});
