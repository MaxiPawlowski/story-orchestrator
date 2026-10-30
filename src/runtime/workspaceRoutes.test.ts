import { FEATURES } from "@features/registry";
import { drawerAt, settingsAt } from "@features/where";
import { judgeIntent, JUDGE_AREA_CONTROL, WORKSPACE_CONTEXT_LABELS, WORKSPACE_PAGES, workspaceCrumb } from "./workspaceRoutes";

describe("workspace breadcrumbs", () => {
  it("name the context and page from the route table, never twice", () => {
    expect(workspaceCrumb({ context: "orchestrator", page: "library" }, "Playing › Story for this chat")).toBe("Orchestrator › Library › Playing › Story for this chat");
    expect(workspaceCrumb({ context: "orchestrator", page: "interface" }, "Interface › Show story status")).toBe("Orchestrator › Interface › Show story status");
    expect(workspaceCrumb({ context: "story", page: "play" }, "Play")).toBe("This story › Play");
    expect(workspaceCrumb({ context: "story" }, "Setup")).toBe("This story › Play › Setup");
  });

  it("every settings or drawer feature's Where line starts with a context and a page that exist", () => {
    const pages = new Set(Object.entries(WORKSPACE_PAGES).flatMap(([context, list]) => list.map((page) => `${WORKSPACE_CONTEXT_LABELS[context as keyof typeof WORKSPACE_CONTEXT_LABELS]} › ${page.label}`)));
    const stale = FEATURES.filter((feature) => feature.where.workspace)
      .filter((feature) => !pages.has(feature.where.label.split(" › ").slice(0, 2).join(" › ")));
    expect(stale.map((feature) => `${feature.id}: ${feature.where.label}`)).toEqual([]);
    expect(FEATURES.find((feature) => feature.id === "stories")?.where.label).toBe("Orchestrator › Library › Playing › Story for this chat");
  });

  it("the crumb's page is the page the Show me link opens", () => {
    const wrong = FEATURES.filter((feature) => feature.where.workspace).filter((feature) => {
      const { context, page } = feature.where.workspace!;
      const label = WORKSPACE_PAGES[context].find((entry) => entry.id === (page ?? WORKSPACE_PAGES[context][0].id))?.label;
      return feature.where.label.split(" › ")[1] !== label;
    });
    expect(wrong.map((feature) => feature.id)).toEqual([]);
  });

  it("a drawer link to a feature control opens This story → Features on that feature", () => {
    expect(drawerAt("#so-feature-speakers-enabled", "Features › Speaker direction")).toMatchObject({
      label: "This story › Features › Speaker direction", workspace: { context: "story", page: "features", feature: "speakers" },
    });
    expect(settingsAt("#so-hud-enabled", "Interface › Show story status").label).toBe("Orchestrator › Interface › Show story status");
  });

  it("the judge link opens Connections on the judge section", () => {
    expect(judgeIntent()).toEqual({ context: "orchestrator", page: "connections", control: JUDGE_AREA_CONTROL });
    expect(JUDGE_AREA_CONTROL).toBe("so-area-judge");
  });
});
