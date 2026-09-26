import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fakeDocument, type FakeDocument } from "../../../test/support/fakeDocument";

const calls: Array<{ content: unknown }> = [];
jest.mock("./context", () => ({
  getContext: () => ({
    callGenericPopup: async (content: unknown) => { calls.push({ content }); return 1; },
    POPUP_TYPE: { CONFIRM: 2, TEXT: 1 },
    POPUP_RESULT: { AFFIRMATIVE: 1 },
  }),
}));

import { showChoicePopup, showConfirmPopup, showTextPopup } from "./popup";

const hostileTitle = "<img src=x onerror=alert(1)>";
let dom: FakeDocument;

beforeEach(() => {
  calls.length = 0;
  dom = fakeDocument();
  (globalThis as { document?: Document }).document = dom.doc;
});

afterAll(() => {
  delete (globalThis as { document?: Document }).document;
});

const handed = () => calls[0]?.content as { textContent?: string } | string | undefined;

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
