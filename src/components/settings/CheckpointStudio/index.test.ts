/** @jest-environment jsdom */

import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import CheckpointStudio from "@components/settings/CheckpointStudio";
import { parseAndNormalizeStory, type NormalizedStory } from "@utils/story-validator";

const feedbackMessages: string[] = [];
const diagnosticsSnapshots: Array<Array<{ name: string; detail: string }>> = [];
const yamlParseMock = jest.fn();

jest.mock("yaml", () => ({
  __esModule: true,
  default: {
    parse: (...args: unknown[]) => yamlParseMock(...args),
    stringify: jest.fn(() => "title: Quest"),
  },
}));

jest.mock("@components/studio/Toolbar", () => ({
  __esModule: true,
  default: (props: any) => createElement("div", null,
    createElement("button", { id: "toolbar-save", onClick: props.onSave }, "save"),
    createElement("button", { id: "toolbar-save-as", onClick: props.onSaveAs }, "save-as"),
    createElement("button", { id: "toolbar-export", onClick: props.onExport }, "export"),
    createElement("button", { id: "toolbar-import", onClick: props.onImportPick }, "import")
  ),
}));

jest.mock("@components/studio/FeedbackAlert", () => ({
  __esModule: true,
  default: ({ feedback }: any) => {
    feedbackMessages.push(feedback?.message ?? "");
    return createElement("div", { id: "feedback-message" }, feedback?.message ?? "");
  },
}));

jest.mock("@components/studio/DiagnosticsPanel", () => ({
  __esModule: true,
  default: ({ diagnostics }: any) => {
    diagnosticsSnapshots.push(diagnostics ?? []);
    return createElement(
      "div",
      { id: "diagnostics" },
      (diagnostics ?? []).map((item: any, index: number) => createElement("div", { key: `${item.name}-${index}` }, `${item.name}: ${item.detail}`))
    );
  },
}));

jest.mock("@components/studio/GraphPanel", () => ({
  __esModule: true,
  default: () => createElement("div", { id: "graph-panel" }),
}));

jest.mock("@components/studio/CheckpointEditorPanel", () => ({
  __esModule: true,
  default: () => createElement("div", { id: "checkpoint-editor" }),
}));

jest.mock("@components/studio/StoryDetailsPanel", () => ({
  __esModule: true,
  default: ({ setDraft }: any) => createElement("div", null,
    createElement("button", {
      id: "make-invalid-conversion",
      onClick: () => setDraft((prev: any) => ({
        ...prev,
        checkpoints: prev.checkpoints.map((cp: any, index: number) => index === 0
          ? {
            ...cp,
            transitions: [{
              id: "edge-1",
              to: prev.checkpoints[1]?.id ?? cp.id,
              trigger: { type: "regex", patterns: [], condition: "" },
              _stableId: "stable-edge-1",
            }],
          }
          : cp),
      })),
    }, "invalid-conversion"),
    createElement("button", {
      id: "make-invalid-validation",
      onClick: () => setDraft((prev: any) => ({ ...prev, title: "   " })),
    }, "invalid-validation")
  ),
}));

const buildStory = () => ({
  title: "Quest",
  description: "Quest description",
  global_lorebook: "Lorebook",
  start: "cp-1",
  checkpoints: [
    {
      id: "cp-1",
      name: "Start",
      objective: "Begin",
      transitions: [
        {
          id: "edge-1",
          to: "cp-2",
          trigger: {
            type: "regex",
            patterns: ["/begin/i"],
            condition: "Move forward",
          },
        },
      ],
    },
    {
      id: "cp-2",
      name: "Next",
      objective: "Continue",
    },
  ],
});

function createValidationResult(input: unknown) {
  const story = input as { title?: string };
  if (!story.title?.trim()) {
    return { ok: false as const, errors: ["title: required"] };
  }
  return { ok: true as const, story: parseAndNormalizeStory(input) };
}

function renderStudio(overrides: Partial<React.ComponentProps<typeof CheckpointStudio>> = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const onSaveStory = jest.fn().mockResolvedValue({ ok: true, key: "saved:quest" });
  const onDeleteStory = jest.fn().mockResolvedValue({ ok: true });
  const onSelectKey = jest.fn();
  const props: React.ComponentProps<typeof CheckpointStudio> = {
    sourceStory: parseAndNormalizeStory(buildStory()) as NormalizedStory,
    validate: createValidationResult,
    libraryEntries: [{ key: "saved:quest", kind: "saved", ok: true, label: "Quest", meta: { name: "Quest" } } as any],
    selectedKey: "saved:quest",
    selectedError: null,
    onSelectKey,
    onSaveStory,
    onDeleteStory,
    disabled: false,
    ...overrides,
  };

  act(() => {
    root.render(createElement(CheckpointStudio, props));
  });

  return {
    container,
    onSaveStory,
    onDeleteStory,
    onSelectKey,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function click(container: HTMLElement, id: string) {
  const button = container.querySelector(`#${id}`) as HTMLButtonElement | null;
  if (!button) throw new Error(`Missing button ${id}`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("CheckpointStudio validation actions", () => {
  const originalActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  const originalPrompt = window.prompt;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = originalActEnv;
    window.prompt = originalPrompt;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  beforeEach(() => {
    feedbackMessages.length = 0;
    diagnosticsSnapshots.length = 0;
    yamlParseMock.mockReset();
    yamlParseMock.mockImplementation((text: string) => {
      if (text.includes("Broken Import")) {
        return { title: "Broken Import" };
      }
      if (text.includes("Import With Broken Draft")) {
        return { title: "Import With Broken Draft" };
      }
      return buildStory();
    });
    window.prompt = jest.fn(() => "Quest Copy");
    URL.createObjectURL = jest.fn(() => "blob:quest");
    URL.revokeObjectURL = jest.fn();
  });

  it("blocks save and save-as when draft conversion fails", async () => {
    const view = renderStudio();

    click(view.container, "make-invalid-conversion");
    click(view.container, "toolbar-save");
    click(view.container, "toolbar-save-as");
    await act(async () => {
      await Promise.resolve();
    });

    expect(view.onSaveStory).not.toHaveBeenCalled();
    expect(window.prompt).not.toHaveBeenCalled();
    expect(view.container.querySelector("#feedback-message")?.textContent).toBe("Story data is incomplete: Transition trigger is incomplete.");
    expect(view.container.querySelector("#diagnostics")?.textContent).toContain("Story data conversion: Transition trigger is incomplete.");
    view.unmount();
  });

  it("blocks export when schema validation fails", () => {
    const view = renderStudio();

    click(view.container, "make-invalid-validation");
    click(view.container, "toolbar-export");

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(view.container.querySelector("#feedback-message")?.textContent).toBe("Cannot export: title: required");
    expect(view.container.querySelector("#diagnostics")?.textContent).toContain("Schema validation: title: required");
    view.unmount();
  });

  it("surfaces schema validation errors during import without saving", async () => {
    const view = renderStudio({
      validate: (input: unknown) => {
        const story = input as { title?: string };
        if (story.title === "Broken Import") {
          return { ok: false as const, errors: ["title: imported title invalid", "checkpoints: missing"] };
        }
        return createValidationResult(input);
      },
    });
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { name: "broken.yaml", text: jest.fn().mockResolvedValue("title: Broken Import") };

    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.onSaveStory).not.toHaveBeenCalled();
    expect(view.container.querySelector("#feedback-message")?.textContent).toBe("title: imported title invalid; checkpoints: missing");
    expect(view.container.querySelector("#diagnostics")?.textContent).toContain("Schema validation: title: imported title invalid; checkpoints: missing");
    view.unmount();
  });

  it("surfaces post-import draft validation errors after loading the imported draft", async () => {
    const normalized = parseAndNormalizeStory(buildStory()) as NormalizedStory;
    normalized.transitions[0].trigger = {
      ...normalized.transitions[0].trigger,
      regexes: [],
      condition: "",
      raw: { type: "regex", patterns: [], condition: "" },
    };
    const view = renderStudio({
      validate: (input: unknown) => {
        const story = input as { title?: string };
        if (story.title === "Import With Broken Draft") {
          return { ok: true as const, story: normalized };
        }
        return createValidationResult(input);
      },
    });
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = { name: "broken-draft.yaml", text: jest.fn().mockResolvedValue("title: Import With Broken Draft") };

    await act(async () => {
      Object.defineProperty(input, "files", { configurable: true, value: [file] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.onSaveStory).not.toHaveBeenCalled();
    expect(view.container.querySelector("#feedback-message")?.textContent).toBe("Cannot import: Transition trigger is incomplete.");
    expect(view.container.querySelector("#diagnostics")?.textContent).toContain("Story data conversion: Transition trigger is incomplete.");
    view.unmount();
  });
});
