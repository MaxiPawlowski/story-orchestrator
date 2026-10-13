import { onLorebookListChanged } from "./worldInfoList";

describe("host lorebook-list observer", () => {
  it("refreshes once per changed inventory, ignores selection/reordering, and disconnects", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const originalObserver = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
    const select = { options: [{ value: "", text: "None" }, { value: "0", text: "Old" }] };
    let callback = () => {};
    const observe = jest.fn();
    const disconnect = jest.fn();
    class Observer {
      constructor(next: () => void) { callback = next; }
      observe = observe;
      disconnect = disconnect;
    }
    Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelector: () => select } });
    Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: Observer });
    try {
      const handler = jest.fn();
      const stop = onLorebookListChanged(handler);
      expect(observe).toHaveBeenCalledWith(select, { childList: true, subtree: true, characterData: true });
      callback();
      expect(handler).not.toHaveBeenCalled();
      select.options.push({ value: "1", text: "Imported" });
      callback();
      expect(handler).toHaveBeenCalledTimes(1);
      select.options.reverse();
      callback();
      expect(handler).toHaveBeenCalledTimes(1);
      select.options = select.options.filter((option) => option.text !== "Old");
      callback();
      expect(handler).toHaveBeenCalledTimes(2);
      stop();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
      if (originalObserver) Object.defineProperty(globalThis, "MutationObserver", originalObserver); else Reflect.deleteProperty(globalThis, "MutationObserver");
    }
  });

  it("is inert when the host has no document", () => {
    expect(() => onLorebookListChanged(() => { throw new Error("unexpected refresh"); })()).not.toThrow();
  });
});
