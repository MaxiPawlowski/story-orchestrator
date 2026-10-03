/**
 * @jest-environment jsdom
 */
import { mountStoryWand } from "./storyWand";

describe("v2.7 06 C6: the wand-menu entry", () => {
  beforeEach(() => { document.body.innerHTML = '<div id="extensionsMenu"><div id="other" class="list-group-item"></div></div>'; });

  it("adds its entries only while visible, runs each on click and on Enter, and leaves other entries alone", () => {
    const recap = jest.fn();
    const flag = jest.fn();
    const handle = mountStoryWand([{ id: "so-wand-recap", icon: "fa-book-open", label: "Story recap", run: recap }, { id: "so-wand-flag", icon: "fa-flag", label: "Flag this moment", run: flag }]);
    expect(document.querySelectorAll('[data-so="story-wand"]')).toHaveLength(0);
    handle.setVisible(true);
    handle.setVisible(true);
    expect(Array.from(document.querySelectorAll('[data-so="story-wand"]')).map((item) => item.textContent)).toEqual(["Story recap", "Flag this moment"]);
    document.querySelector<HTMLElement>("#so-wand-recap span")!.click();
    document.getElementById("so-wand-flag")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    document.getElementById("so-wand-flag")!.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect([recap.mock.calls.length, flag.mock.calls.length]).toEqual([1, 1]);
    handle.setVisible(false);
    expect(document.querySelectorAll('[data-so="story-wand"]')).toHaveLength(0);
    handle.setVisible(true);
    handle.dispose();
    expect(document.querySelectorAll('[data-so="story-wand"]')).toHaveLength(0);
    expect(document.getElementById("other")).not.toBeNull();
  });
});
