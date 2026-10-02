import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fakeDocument, type FakeDocument } from "../../../test/support/fakeDocument";

const calls: Array<{ content: unknown; options?: Record<string, unknown> }> = [];
const answer: { result: unknown } = { result: 1 };
jest.mock("./context", () => ({
  getContext: () => ({
    callGenericPopup: async (content: unknown, _type: number, _input?: string, options?: Record<string, unknown>) => { calls.push({ content, options }); return answer.result; },
    POPUP_TYPE: { CONFIRM: 2, TEXT: 1 },
    POPUP_RESULT: { AFFIRMATIVE: 1, NEGATIVE: 0 },
  }),
}));

import { askConfirm, showChoicePopup, showConfirmPopup, showTextPopup } from "./popup";

const hostileTitle = "<img src=x onerror=alert(1)>";
let dom: FakeDocument;

beforeEach(() => {
  calls.length = 0;
  answer.result = 1;
  dom = fakeDocument();
  (globalThis as { document?: Document }).document = dom.doc;
});

afterAll(() => {
  delete (globalThis as { document?: Document }).document;
});

const handed = () => calls[0]?.content as { textContent?: string } | string | undefined;

describe("a destructive question defaults to the safe answer (T4-3)", () => {
  it("a safe-default confirm makes the cancel button the default, so Enter keeps", async () => {
    await showConfirmPopup("Delete it?", { okButton: "Delete", cancelButton: "Keep", safeDefault: true });
    expect(calls[0].options).toMatchObject({ okButton: "Delete", cancelButton: "Keep", defaultResult: 0 });
  });

  it("a safe-default choice popup does the same", async () => {
    await showChoicePopup("Delete it?", { okButton: { id: "delete", label: "Delete" }, cancelButton: "Keep", safeDefault: true });
    expect(calls[0].options).toMatchObject({ defaultResult: 0 });
  });

  it("an ordinary confirm keeps the host's own default", async () => {
    await showConfirmPopup("Resume?");
    expect(calls[0].options).not.toHaveProperty("defaultResult");
  });

  it("tells a kept answer from a dismissed one", async () => {
    answer.result = 1;
    expect(await askConfirm("Delete it?")).toBe("confirmed");
    answer.result = 0;
    expect(await askConfirm("Delete it?")).toBe("declined");
    answer.result = null;
    expect(await askConfirm("Delete it?")).toBe("dismissed");
  });
});

describe("R7: nothing a popup shows reaches the host as markup", () => {
  it("a confirm popup hands the host an element whose text is the string, not the string itself", async () => {
    await showConfirmPopup(`Delete "${hostileTitle}" from the library?`);
    const content = handed();
    expect(typeof content).not.toBe("string");
    expect((content as { textContent: string }).textContent).toBe(`Delete "${hostileTitle}" from the library?`);
    expect(dom.created).not.toContain("img");
    expect(dom.markupWrites).toEqual([]);
  });

  it("a choice popup treats a string the same way", async () => {
    await showChoicePopup(hostileTitle, { okButton: { id: "ok", label: "OK" } });
    expect(typeof handed()).not.toBe("string");
    expect(dom.markupWrites).toEqual([]);
  });

  it("a text popup appends a string as text, never through innerHTML", () => {
    showTextPopup(hostileTitle);
    const anchor = handed() as { textContent: string };
    expect(anchor.textContent).toBe(hostileTitle);
    expect(dom.created).not.toContain("img");
    expect(dom.markupWrites).toEqual([]);
  });

  it("no source file writes markup through a DOM sink", () => {
    const root = join(__dirname, "..", "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { walk(path); continue; }
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name) || name === "fakeDocument.ts") continue;
        const text = readFileSync(path, "utf8");
        if (/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write\(/.test(text)) offenders.push(path);
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
