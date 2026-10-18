import { drawerOpener } from "@components/widgets/WidgetCard";
import { STORY_MEMORY_CONTROL, storyPageFor } from "./drawerTab";

describe("storyPageFor", () => {
  it("opens Play on the memory disclosure for the memory tab", () => {
    expect(storyPageFor("memory")).toEqual({ context: "story", page: "play", control: STORY_MEMORY_CONTROL });
    expect(STORY_MEMORY_CONTROL).toBe("so-open-memory");
  });

  it("opens Play without a control for the overview and no tab", () => {
    expect(storyPageFor("overview")).toEqual({ context: "story", page: "play" });
    expect(storyPageFor()).toEqual({ context: "story", page: "play" });
  });
});

describe("drawerOpener", () => {
  it("hands the widget's tab to the story opener", () => {
    const open = jest.fn();
    expect(drawerOpener(open)?.("memory")).toEqual({ ok: true });
    expect(open).toHaveBeenCalledWith("memory");
    expect(drawerOpener(undefined)).toBeUndefined();
  });
});
