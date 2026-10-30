/**
 * @jest-environment jsdom
 */
import { THINKING_TARGET_ID } from "./checks";
import { revealSetting } from "./settingReveal";
import { settingIntent } from "./workspaceRoutes";
import type { WorkspaceIntent } from "./workspaceNavigation";

describe("revealSetting (C8 v27-d-01)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  test("a control the open page does not render opens the page that owns it", () => {
    const opened: WorkspaceIntent[] = [];
    revealSetting("so-extraction-profile", (intent) => opened.push(intent));
    expect(opened).toEqual([{ context: "orchestrator", page: "models", control: "so-extraction-profile" }]);
    expect(opened[0]).toEqual(settingIntent("so-extraction-profile"));
  });

  test("the thinking warning's Show me opens the inner voice feature page where the harvest line lives (C8 v27-d-08)", () => {
    const opened: WorkspaceIntent[] = [];
    revealSetting(THINKING_TARGET_ID, (intent) => opened.push(intent));
    expect(opened).toEqual([{ context: "story", page: "features", feature: "inner", control: "so-feature-inner-harvestReasoning" }]);
  });

  test("a feature-looking id naming no feature falls back to Models", () => {
    expect(settingIntent("so-feature-nothing-enabled")).toEqual({ context: "orchestrator", page: "models", control: "so-feature-nothing-enabled" });
  });

  test("a mounted control is revealed in place without navigating", () => {
    document.body.innerHTML = `<details id="outer"><details id="inner"><select id="so-extraction-profile"></select></details></details>`;
    const scroll = jest.fn();
    Element.prototype.scrollIntoView = scroll;
    const opened: WorkspaceIntent[] = [];
    revealSetting("so-extraction-profile", (intent) => opened.push(intent));
    expect(opened).toEqual([]);
    expect((document.getElementById("outer") as HTMLDetailsElement).open).toBe(true);
    expect((document.getElementById("inner") as HTMLDetailsElement).open).toBe(true);
    expect(document.getElementById("so-extraction-profile")?.classList.contains("so-revealed")).toBe(true);
    expect(scroll).toHaveBeenCalled();
  });
});
