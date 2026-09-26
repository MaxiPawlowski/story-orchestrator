/**
 * @jest-environment jsdom
 */
import { act, createElement } from "react";
import { createMountRegistry } from "./mountRegistry";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const soGlobals = () => Object.keys(globalThis).filter((name) => name.startsWith("storyOrchestrator") && Reflect.get(globalThis, name) !== undefined);

const mountLikeTheExtension = () => {
  const ui = createMountRegistry();
  const containers = ["story-orchestrator-settings", "drawer-manager", "so-hud-root", "so-studio-root"].map((id) => {
    const element = ui.element(document.createElement("div"));
    element.id = id;
    document.body.appendChild(element);
    return element;
  });
  act(() => {
    for (const container of containers) ui.root(container, createElement("span", { "data-mounted": container.id }, container.id));
  });
  const toggle = document.createElement("div");
  document.body.appendChild(toggle);
  const clicks = jest.fn();
  toggle.addEventListener("click", clicks);
  ui.add(() => toggle.removeEventListener("click", clicks));
  const mount = jest.fn();
  ui.listen(document, "DOMContentLoaded", mount, { once: true });
  const retry = jest.fn();
  ui.timeout(retry, 100);
  ui.global("storyOrchestratorRuntime", { manager: true });
  ui.global("storyOrchestratorStudioDraft", {});
  ui.global("storyOrchestratorStudioTabs", ["graph"]);
  return { ui, toggle, clicks, mount, retry };
};

describe("mount registry", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  it("counts everything the extension creates while it is mounted", () => {
    const { ui } = mountLikeTheExtension();
    expect(ui.counts()).toEqual({ roots: 4, elements: 4, listeners: 1, timers: 1, globals: 3, disposers: 1 });
    expect(document.querySelectorAll("[data-mounted]")).toHaveLength(4);
    expect(soGlobals()).toHaveLength(3);
    act(() => ui.dispose());
  });

  it("leaves no root, element, listener, timer or storyOrchestrator global behind after dispose", () => {
    const { ui, toggle, clicks, mount, retry } = mountLikeTheExtension();
    act(() => ui.dispose());
    expect(ui.counts()).toEqual({ roots: 0, elements: 0, listeners: 0, timers: 0, globals: 0, disposers: 0 });
    expect(document.querySelectorAll("[data-mounted]")).toHaveLength(0);
    expect(document.getElementById("drawer-manager")).toBeNull();
    expect(soGlobals()).toEqual([]);
    toggle.click();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    jest.advanceTimersByTime(1000);
    expect(clicks).not.toHaveBeenCalled();
    expect(mount).not.toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it("control: without dispose, the same listener, timer and globals are all still live", () => {
    const { ui, toggle, clicks, mount, retry } = mountLikeTheExtension();
    toggle.click();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    jest.advanceTimersByTime(1000);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(ui.counts()).toMatchObject({ listeners: 0, timers: 0, globals: 3 });
    act(() => ui.dispose());
  });

  it("keeps disposing after one disposer throws", () => {
    const ui = createMountRegistry();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const after = jest.fn();
    ui.add(() => { throw new Error("boom"); });
    ui.add(after);
    ui.dispose();
    expect(after).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
