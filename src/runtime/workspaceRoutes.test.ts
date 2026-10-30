import { FEATURES } from "@features/registry";
import { drawerAt, settingsAt } from "@features/where";
import { judgeIntent, lastPageValue, resumeIntent, settingIntent, settingsLocationOf, visiblePages, WORKSPACE_CONTEXT_LABELS, WORKSPACE_PAGES, workspaceCrumb } from "./workspaceRoutes";

describe("workspace breadcrumbs", () => {
  it("name the context and page from the route table, never twice", () => {
    expect(workspaceCrumb({ context: "orchestrator", page: "library" }, "Start › New story")).toBe("Settings › Library › Start › New story");
    expect(workspaceCrumb({ context: "orchestrator", page: "display" }, "Display › Show story status")).toBe("Settings › Display › Show story status");
    expect(workspaceCrumb({ context: "orchestrator", page: "images", sub: "model-sources" }, "Model sources")).toBe("Settings › Images & stage › Model sources");
    expect(workspaceCrumb({ context: "story", page: "play" }, "Play")).toBe("This chat › Play");
    expect(workspaceCrumb({ context: "story" }, "Setup")).toBe("This chat › Play › Setup");
  });

  it("every settings or drawer feature's Where line starts with a context and a page that exist", () => {
    const pages = new Set(Object.entries(WORKSPACE_PAGES).flatMap(([context, list]) => list.map((page) => `${WORKSPACE_CONTEXT_LABELS[context as keyof typeof WORKSPACE_CONTEXT_LABELS]} › ${page.label}`)));
    const stale = FEATURES.filter((feature) => feature.where.workspace)
      .filter((feature) => !pages.has(feature.where.label.split(" › ").slice(0, 2).join(" › ")));
    expect(stale.map((feature) => `${feature.id}: ${feature.where.label}`)).toEqual([]);
    expect(FEATURES.find((feature) => feature.id === "stories")?.where.label).toBe("This chat › Story settings › Story › Story for this chat");
  });

  it("the crumb's page is the page the Show me link opens", () => {
    const wrong = FEATURES.filter((feature) => feature.where.workspace).filter((feature) => {
      const { context, page } = feature.where.workspace!;
      const label = WORKSPACE_PAGES[context].find((entry) => entry.id === (page ?? WORKSPACE_PAGES[context][0].id))?.label;
      return feature.where.label.split(" › ")[1] !== label;
    });
    expect(wrong.map((feature) => feature.id)).toEqual([]);
  });

  it("a drawer link to a feature control opens This chat → Story settings on that feature", () => {
    expect(drawerAt("#so-feature-speakers-enabled", "Speaker direction")).toMatchObject({
      label: "This chat › Story settings › Speaker direction", workspace: { context: "story", page: "features", feature: "speakers" },
    });
    expect(settingsAt("#so-hud-enabled", "Display › Show story status").label).toBe("Settings › Display › Show story status");
  });

  it("the judge link opens the Judge page, on a use when it names one", () => {
    expect(judgeIntent()).toEqual({ context: "orchestrator", page: "judge" });
    expect(judgeIntent("so-judge-use-director")).toEqual({ context: "orchestrator", page: "judge", control: "so-judge-use-director" });
  });
});

describe("one home per setting (v3.0 29 phase 2)", () => {
  it("routes each control to the page that renders it", () => {
    expect(settingsLocationOf("so-extraction-profile")).toEqual({ page: "models" });
    expect(settingsLocationOf("so-judge-key")).toEqual({ page: "judge" });
    expect(settingsLocationOf("so-image-route-quality")).toEqual({ page: "images", sub: "picture-types" });
    expect(settingsLocationOf("so-model-sources")).toEqual({ page: "images", sub: "model-sources" });
    expect(settingsLocationOf("so-device-sprites-blink")).toEqual({ page: "images" });
    expect(settingsLocationOf("so-device-display-hud-enabled")).toEqual({ page: "display" });
    expect(settingsLocationOf("so-wi-gating-mode")).toEqual({ page: "world" });
    expect(settingsLocationOf("so-copilot-ask")).toEqual({ page: "authoring" });
    expect(settingsLocationOf("so-capabilities")).toEqual({ page: "diagnostics" });
  });

  it("sends story choice, the Author view switch and per-chat features to This chat → Story settings", () => {
    expect(settingIntent("story-library-select")).toEqual({ context: "story", page: "features", control: "story-library-select" });
    expect(settingIntent("so-author-view-switch")).toEqual({ context: "story", page: "features", control: "so-author-view-switch" });
    expect(settingIntent("so-feature-pacing-enabled")).toEqual({ context: "story", page: "features", feature: "pacing", control: "so-feature-pacing-enabled" });
    expect(settingIntent("so-keep-last-question")).toEqual({ context: "orchestrator", page: "features", feature: "speakers", control: "so-keep-last-question" });
  });

  it("a player's This chat nav is Play and Story settings; Author view adds Review and Author", () => {
    expect(visiblePages("story", false).map((page) => page.label)).toEqual(["Play", "Story settings"]);
    expect(visiblePages("story", true).map((page) => page.label)).toEqual(["Play", "Story settings", "Review", "Author"]);
    expect(visiblePages("orchestrator", false).map((page) => page.label)).toEqual(["Library", "Features", "Models", "Judge", "Images & stage", "World & lore", "Display",
      "Authoring", "Diagnostics", "Help"]);
  });
});

describe("launchers reopen the last workspace page", () => {
  it("resumes a stored page, falls back to Play, and never resumes an author page in player view", () => {
    expect(resumeIntent(null, false)).toEqual({ context: "story", page: "play" });
    expect(resumeIntent(lastPageValue({ context: "story", page: "features" }), false)).toEqual({ context: "story", page: "features" });
    expect(resumeIntent(lastPageValue({ context: "orchestrator", page: "images", sub: "model-sources" }), false)).toEqual({ context: "orchestrator", page: "images", sub: "model-sources" });
    expect(resumeIntent("orchestrator/images/bogus", false)).toEqual({ context: "orchestrator", page: "images" });
    expect(resumeIntent("story/author", false)).toEqual({ context: "story", page: "play" });
    expect(resumeIntent("story/author", true)).toEqual({ context: "story", page: "author" });
    expect(resumeIntent("nowhere/at-all", true)).toEqual({ context: "story", page: "play" });
  });
});
