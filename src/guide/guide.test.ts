import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FEATURES, authorGuideDoc } from "@features/registry";
import { GUIDE_TOPIC_IDS } from "@copilot/guideTopics";
import { GUIDE_ASSETS, GUIDE_NAV, GUIDE_PAGES } from "./pages.generated";
import { GuideMarkdown } from "./GuideMarkdown";
import { docToId, normalizePath, resolveAsset, resolveLink, slugify, targetForDoc } from "./links";
import { groupPages, indexPages, NAV_ALL, NAV_MORE, searchGuide, visiblePages } from "./search";
import { parseMarkdown } from "./markdown";
import { requestGuide, onGuideRequest } from "./request";
import type { GuidePage } from "./types";

const PAGES: readonly GuidePage[] = GUIDE_PAGES;
const ids = new Set(PAGES.map((page) => page.id));
const HOME = "https://github.com/o/r";

describe("in-plugin guide", () => {
  it("every registry feature and author topic points at a bundled page", () => {
    const missing = [...FEATURES.map((feature) => feature.doc), ...GUIDE_TOPIC_IDS.map(authorGuideDoc)]
      .filter((doc) => {
        const target = targetForDoc(doc);
        const page = PAGES.find((candidate) => candidate.id === target.id);
        return !page || (target.anchor !== undefined && !page.headings.some((heading) => heading.slug === target.anchor));
      });
    expect(missing).toEqual([]);
    expect(GUIDE_TOPIC_IDS.map(authorGuideDoc).filter((doc) => !/^author\/fields\/[a-z-]+\.md#[a-z0-9-]+$/.test(doc))).toEqual([]);
  });

  it("an <a id> line names the next heading's anchor, and a heading without one keeps its slug", () => {
    const blocks = parseMarkdown('<a id="gates"></a>\n\n## Gates and exits\n\n## Plain');
    expect(blocks.map((block) => (block.kind === "heading" ? [block.text, block.anchor ?? null] : block.kind))).toEqual([["Gates and exits", "gates"], ["Plain", null]]);
  });


  it("every page renders without raw HTML and every heading gets the slug the bundle recorded", () => {
    for (const page of PAGES) {
      const html = renderToStaticMarkup(createElement(GuideMarkdown, { doc: page.doc, body: page.body, homePage: HOME, onNavigate: () => undefined, assetSrc: (asset: string) => GUIDE_ASSETS[asset] }));
      expect(html).not.toMatch(/<script|onerror=/i);
      const images = [...html.matchAll(/<img[^>]*>/g)].map((match) => match[0]);
      expect(images.filter((tag) => !/ src="data:image\/(?:png|jpeg|webp);base64,/.test(tag) || !/ alt="[^"]+"/.test(tag))).toEqual([]);
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
    expect(normalizePath("author/fields/../wizard.md")).toBe("author/wizard.md");
    expect(docToId("setup/images.md")).toBe("setup/images");
    expect(slugify("The `/story` command")).toBe("the-story-command");
  });

  it("shows only bundled guide images, and refuses remote, traversing, data and alt-less ones", () => {
    const render = (body: string) => renderToStaticMarkup(createElement(GuideMarkdown, {
      doc: "setup/README.md", body, homePage: HOME, assetSrc: (asset: string) => (asset === "assets/ok.png" ? "data:image/png;base64,AA" : undefined),
    }));
    expect(render("![The panel](../assets/ok.png)")).toContain('<img src="data:image/png;base64,AA" alt="The panel" data-so="guide-image" data-asset="assets/ok.png"');
    for (const src of ["https://evil.example/a.png", "//evil.example/a.png", "javascript:alert(1)", "data:image/png;base64,AA", "../../secret.png", "../assets/missing.png", "../assets/ok.png?x", "/assets/ok.png"]) {
      expect([src, render(`![Alt <b onerror=x>](${src})`)]).toEqual([src, expect.not.stringContaining("<img")]);
    }
    expect(render("![x\" onerror=\"alert(1)](https://evil.example)")).not.toMatch(/onerror="/);
    expect(render("![](../assets/ok.png)")).not.toContain("<img");
    expect(resolveAsset("setup/README.md", "../assets/ok.png")).toBe("assets/ok.png");
    expect(resolveAsset("author/fields/moving-on.md", "../../assets/a.webp")).toBe("assets/a.webp");
    expect(resolveAsset("setup/README.md", "../assets/a.svg")).toBeNull();
    expect(Object.keys(GUIDE_ASSETS).length).toBeGreaterThan(0);
  });

  it("hides author pages in player mode and finds pages by title first", () => {
    expect(visiblePages(PAGES, false).some((page) => page.audience === "author")).toBe(false);
    expect(groupPages(visiblePages(PAGES, true), GUIDE_NAV).map((group) => group.audience)).toEqual(["player", "setup", "author"]);
    const author = groupPages(visiblePages(PAGES, true), GUIDE_NAV).find((group) => group.audience === "author");
    expect(author?.sections.map((section) => section.title)).toEqual(["Start here", "Tools", "Reference", "Story fields"]);
    expect(author?.sections[0].pages[0].id).toBe("author/README");
    expect(author?.sections.at(-1)?.pages.map((page) => page.id)).toEqual(["story", "characters", "tracking", "scenes", "scene-effects", "moving-on", "lore-and-memory", "game-layer"].map((name) => `author/fields/${name}`));
    expect(groupPages(visiblePages(PAGES, false), GUIDE_NAV).flatMap((group) => group.sections.map((section) => section.title))).toEqual(["Start here", "Play", "Set up"]);
    const loose = groupPages([...PAGES, { id: "setup/stray", doc: "setup/stray.md", audience: "setup", title: "Stray", headings: [], body: "" }], GUIDE_NAV);
    expect(loose.find((group) => group.audience === "setup")?.sections.at(-1)).toEqual({ title: NAV_MORE, pages: [expect.objectContaining({ id: "setup/stray" })] });
    expect(groupPages(PAGES.filter((page) => page.audience === "setup")).map((group) => group.sections.map((section) => [section.title, section.pages[0].id]))).toEqual([[[NAV_ALL, "setup/README"]]]);

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
