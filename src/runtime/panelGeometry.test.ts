import { DOCK_BELOW, dockInset, docked, shownPanels } from "./panelGeometry";

describe("docked panels on a narrow screen", () => {
  const phone = { width: 390, height: 844 };
  const desktop = { width: 1400, height: 900 };

  it("shows only the panel opened last while docked, every open panel otherwise", () => {
    expect(docked(phone)).toBe(true);
    expect(shownPanels(["journal", "help", "suggestions"], phone)).toEqual(["suggestions"]);
    expect(shownPanels(["journal", "help", "suggestions"], desktop)).toEqual(["journal", "help", "suggestions"]);
    expect(shownPanels([], phone)).toEqual([]);
    expect(docked({ width: DOCK_BELOW, height: 900 })).toBe(false);
  });

  it("stops a docked panel above the chat form", () => {
    expect(dockInset(700, 844)).toBe(144);
    expect(dockInset(843.6, 844)).toBe(0);
    expect(dockInset(null, 844)).toBe(0);
    expect(dockInset(Number.NaN, 844)).toBe(0);
    expect(dockInset(900, 844)).toBe(0);
    expect(dockInset(-50, 844)).toBe(844);
  });
});
