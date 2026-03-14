/** @jest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import GraphPanel from "@components/studio/GraphPanel";

const cytoscapeMock = jest.fn();
const dagreRegisterMock = jest.fn();

jest.mock("cytoscape", () => ({
  __esModule: true,
  default: (...args: unknown[]) => cytoscapeMock(...args),
}));

jest.mock("cytoscape-dagre", () => ({
  __esModule: true,
  default: (...args: unknown[]) => dagreRegisterMock(...args),
}));

jest.mock("@components/studio/HelpTooltip", () => ({
  __esModule: true,
  default: () => createElement("span", null, "help"),
}));

type MockCy = {
  add: jest.Mock;
  destroy: jest.Mock;
  elements: jest.Mock;
  fit: jest.Mock;
  layout: jest.Mock;
  nodes: jest.Mock;
  off: jest.Mock;
  on: jest.Mock;
  resize: jest.Mock;
  state: {
    elements: any[];
    nodes: Array<{ id: () => string; position: (next?: { x: number; y: number }) => { x: number; y: number } }>;
  };
};

function createCyInstance(options: { throwOnDagre?: boolean } = {}): MockCy {
  const state = {
    elements: [] as any[],
    nodes: [] as Array<{ id: () => string; position: (next?: { x: number; y: number }) => { x: number; y: number } }>,
  };
  const instance: MockCy = {
    state,
    on: jest.fn(),
    off: jest.fn(),
    destroy: jest.fn(),
    resize: jest.fn(),
    fit: jest.fn(),
    add: jest.fn((elements: any[]) => {
      state.elements = [...elements];
      state.nodes = elements
        .filter((item) => item.group === "nodes")
        .map((item) => {
          let current = { x: 10, y: 20 };
          return {
            id: () => item.data.id,
            position: (next?: { x: number; y: number }) => {
              if (next) current = next;
              return current;
            },
          };
        });
    }),
    elements: jest.fn(() => ({
      length: state.elements.length,
      remove: jest.fn(() => {
        state.elements = [];
        state.nodes = [];
      }),
    })),
    nodes: jest.fn(() => state.nodes),
    layout: jest.fn((layoutOptions: { name: string }) => {
      if (options.throwOnDagre && layoutOptions.name === "dagre") {
        throw new Error("dagre unavailable");
      }
      return { run: jest.fn() };
    }),
  };
  return instance;
}

function renderGraphPanel() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const onSelect = jest.fn();

  act(() => {
    root.render(createElement(GraphPanel, {
      draft: {
        title: "Quest",
        global_lorebook: "Lorebook",
        start: "cp-1",
        checkpoints: [
          {
            id: "cp-1",
            name: "Start",
            objective: "Begin",
            transitions: [{
              id: "edge-1",
              to: "cp-2",
              trigger: { type: "regex", patterns: ["/begin/i"], condition: "Begin" },
              _stableId: "stable-edge-1",
            }],
          },
          { id: "cp-2", name: "Next", objective: "Continue" },
        ],
      },
      selectedId: "cp-1",
      canAddTransition: true,
      onSelect,
      onAddCheckpoint: jest.fn(),
      onAddTransition: jest.fn(),
    }));
  });

  return {
    container,
    onSelect,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function getGraphContainer(container: HTMLElement) {
  const match = Array.from(container.querySelectorAll("div")).find((element) =>
    element.className.includes("min-h-[20rem]")
  );
  if (!(match instanceof HTMLDivElement)) {
    throw new Error("Missing graph container");
  }
  return match;
}

describe("GraphPanel", () => {
  const originalActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  const originalResizeObserver = (globalThis as any).ResizeObserver;
  const originalWarn = console.warn;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = originalActEnv;
    (globalThis as any).ResizeObserver = originalResizeObserver;
    console.warn = originalWarn;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    cytoscapeMock.mockReset();
    dagreRegisterMock.mockReset();
    dagreRegisterMock.mockImplementation(() => undefined);
    (globalThis as any).ResizeObserver = undefined;
    console.warn = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("shows the dagre loading fallback before the plugin finishes loading", async () => {
    cytoscapeMock.mockReturnValue(createCyInstance());

    const view = renderGraphPanel();

    expect(view.container.textContent).toContain("Loading Dagre layout...");

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    view.unmount();
  });

  it("retries initialization until the graph container has a measurable size", async () => {
    const cy = createCyInstance();
    cytoscapeMock.mockReturnValue(cy);

    const view = renderGraphPanel();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const graphContainer = getGraphContainer(view.container);

    act(() => {
      jest.advanceTimersByTime(0);
      jest.advanceTimersByTime(100);
    });
    expect(cytoscapeMock).not.toHaveBeenCalled();

    Object.defineProperty(graphContainer, "offsetWidth", { configurable: true, value: 480 });
    Object.defineProperty(graphContainer, "offsetHeight", { configurable: true, value: 320 });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(cytoscapeMock).toHaveBeenCalledTimes(1);
    expect(cy.add).toHaveBeenCalled();
    expect(cy.layout).toHaveBeenCalledWith(expect.objectContaining({ name: "dagre" }));
    view.unmount();
  });

  it("falls back to grid when the requested layout throws during initialization", async () => {
    const cy = createCyInstance({ throwOnDagre: true });
    cytoscapeMock.mockReturnValue(cy);

    const view = renderGraphPanel();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const graphContainer = getGraphContainer(view.container);
    Object.defineProperty(graphContainer, "offsetWidth", { configurable: true, value: 480 });
    Object.defineProperty(graphContainer, "offsetHeight", { configurable: true, value: 320 });

    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(cy.layout).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: "dagre" }));
    expect(cy.layout).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: "grid" }));
    expect(console.warn).toHaveBeenCalledWith("[Story - GraphPanel] Primary layout failed, falling back to grid", expect.any(Error));
    expect(cy.fit).toHaveBeenCalled();
    view.unmount();
  });
});
