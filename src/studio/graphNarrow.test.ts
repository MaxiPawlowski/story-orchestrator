import type { Core } from "cytoscape";
import { buildGraphElements, CHAPTER_LANE_PREFIX, READABLE_ZOOM, readableOnNarrow } from "@components/studio/graphPanelUtils";

describe("T3-6: a tall graph in a narrow Studio stays readable", () => {
  const fakeCy = (width: number, fitZoom: number) => {
    const view = { zoom: fitZoom, pan: { x: 0, y: 0 } };
    const cy = {
      width: () => width,
      zoom: (level?: number) => { if (level !== undefined) view.zoom = level; return view.zoom; },
      pan: (next: { x: number; y: number }) => { view.pan = next; },
      elements: () => ({ length: 30, boundingBox: () => ({ x1: 0, y1: 0, w: 200, h: 3000 }) }),
    };
    return { cy: cy as unknown as Core, view };
  };

  it("at 345 px a fit that shrinks the graph to a sliver zooms back to a readable level, anchored at the top", () => {
    const { cy, view } = fakeCy(345, 0.08);
    readableOnNarrow(cy);
    expect(view).toEqual({ zoom: READABLE_ZOOM, pan: { x: 345 / 2 - 100 * READABLE_ZOOM, y: 32 } });
  });

  it("control: a wide panel, or a fit that is already readable, keeps the fit", () => {
    const wide = fakeCy(900, 0.08);
    readableOnNarrow(wide.cy);
    const readable = fakeCy(345, 0.8);
    readableOnNarrow(readable.cy);
    expect([wide.view.zoom, readable.view.zoom]).toEqual([0.08, 0.8]);
  });

  it("the graph elements still build (smoke over the same module)", () => {
    expect(buildGraphElements({ checkpoints: [{ id: "a", name: "A" }] }, null).some((element) => element.data.id === "a" && !element.data.id.startsWith(CHAPTER_LANE_PREFIX))).toBe(true);
  });
});
