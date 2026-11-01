import { readFileSync } from "fs";
import { join } from "path";
import { applyHostStyle } from "./hostStyle";
import { defaultGlobalSettings } from "./settingsModel";

const HOST_CSS = readFileSync(join(__dirname, "..", "styles", "host.css"), "utf8");

describe("host styles: ST's own UI restyled behind a root flag", () => {
  it("compact thoughts is on by default and the flag follows the setting", () => {
    expect(defaultGlobalSettings().display.compactThoughts).toBe(true);
    const root = { dataset: {} as DOMStringMap };
    applyHostStyle(root, { compactThoughts: true });
    expect(root.dataset.soCompactThoughts).toBe("");
    applyHostStyle(root, { compactThoughts: false });
    expect("soCompactThoughts" in root.dataset).toBe(false);
    applyHostStyle(root, undefined);
    expect(root.dataset.soCompactThoughts).toBe("");
  });

  it("every host.css rule is gated by a root flag and scoped to the chat", () => {
    const selectors = HOST_CSS.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((block) => block.split("{")[0]).flatMap((head) => head.split(","))
      .map((selector) => selector.trim()).filter(Boolean);
    expect(selectors.length).toBeGreaterThan(0);
    expect(selectors.filter((selector) => !/^html\[data-so-[a-z-]+\] #chat /.test(selector))).toEqual([]);
    expect(HOST_CSS).toMatch(/\.mes_reasoning_header/);
  });
});
