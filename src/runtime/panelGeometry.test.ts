import { DOCK_BELOW, SHEET_PEEK, SHEET_WIDTH, dockInset, docked, nearestSnap, nextSnap, sheetDock, sheetSnaps, shownPanels } from "./panelGeometry";

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

describe("v3.0 29 IC5/IC6: the story sheet docks right of the chat and, on a phone, leaves the last reply readable", () => {
  it("docks into the room right of the chat, clamped to its width range, and overlays when the room is too narrow", () => {
    expect(sheetDock(1920, 1488, 380)).toEqual({ width: 380, overlay: false });
    expect(sheetDock(1920, 1600, 380)).toEqual({ width: 320, overlay: false });
    expect(sheetDock(1920, 1488, 9999)).toEqual({ width: 432, overlay: false });
    expect(sheetDock(1280, 1100, 380)).toEqual({ width: 380, overlay: true });
    expect(sheetDock(1920, 1488, 10).width).toBe(SHEET_WIDTH.min);
  });

  it("caps the half snap so the last reply stays visible, never below the peek height", () => {
    const snaps = sheetSnaps(844, 700, 60, 200);
    expect(snaps.full).toBe(640);
    expect(snaps.half).toBe(338);
    expect(snaps.half).toBeLessThanOrEqual(700 - 60 - 200);
    expect(snaps.peek).toBe(SHEET_PEEK);
    expect(sheetSnaps(844, 700, 60, 2000).half).toBe(320);
    expect(sheetSnaps(844, 170, 60, 80).half).toBe(SHEET_PEEK);
  });

  it("snaps a dragged height to the nearest point and cycles on press", () => {
    const snaps = { peek: 120, half: 300, full: 640 };
    expect(nearestSnap(140, snaps)).toBe("peek");
    expect(nearestSnap(420, snaps)).toBe("half");
    expect(nearestSnap(600, snaps)).toBe("full");
    expect(nextSnap("peek")).toBe("half");
    expect(nextSnap("full")).toBe("peek");
  });
});
