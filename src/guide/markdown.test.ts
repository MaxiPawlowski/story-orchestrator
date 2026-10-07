import { inlineText, parseInline, parseMarkdown, plainText, splitRow, type ListBlock } from "./markdown";

describe("guide markdown", () => {
  it("parses headings, paragraphs joined across lines, rules and fenced code", () => {
    const blocks = parseMarkdown("# Title\n\nOne line\ncontinues here.\n\n---\n\n```\n# not a heading\n```");
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "rule", "code"]);
    expect(blocks[1].kind === "paragraph" && inlineText(blocks[1].children)).toBe("One line continues here.");
    expect(blocks[3].kind === "code" && blocks[3].text).toBe("# not a heading");
  });

  it("nests lists by indent and joins an item's continuation lines", () => {
    const [list] = parseMarkdown("1. Open the group\n   chat first.\n2. Then:\n   - **Start**: new\n   - Continue\n3. Write.") as ListBlock[];
    expect(list.ordered).toBe(true);
    expect(list.items.map((item) => inlineText(item.children))).toEqual(["Open the group chat first.", "Then:", "Write."]);
    expect(list.items[1].sub?.items.map((item) => inlineText(item.children))).toEqual(["Start: new", "Continue"]);
  });

  it("splits table rows on bars outside code and escapes", () => {
    expect(splitRow("| `a | b` | c \\| d | e |")).toEqual(["`a | b`", "c \\| d", "e"]);
    const [table] = parseMarkdown("| A | B |\n|---|---|\n| `x` | y \\| z |");
    expect(table.kind).toBe("table");
    if (table.kind === "table") expect(table.rows[0].map(inlineText)).toEqual(["x", "y | z"]);
  });

  it("reads strong, emphasis, code and links, and leaves snake_case words alone", () => {
    const nodes = parseInline("**Bold** and *it* `c*o*de` [link](a.md) so_card_name v*N*");
    expect(nodes.map((node) => node.kind)).toEqual(["strong", "text", "em", "text", "code", "text", "link", "text", "em"]);
    expect(inlineText(nodes)).toBe("Bold and it c*o*de link so_card_name vN");
  });

  it("keeps raw HTML as text and drops comments", () => {
    const nodes = parseInline("<script>alert(1)</script><img src=x onerror=alert(1)>");
    expect(nodes).toEqual([{ kind: "text", text: "<script>alert(1)</script><img src=x onerror=alert(1)>" }]);
    expect(parseMarkdown("<!-- generated -->\nText")).toEqual([{ kind: "paragraph", children: [{ kind: "text", text: "Text" }] }]);
  });

  it("reads an image with its alt text, and searches by the alt text", () => {
    expect(parseInline("See ![The panel](../assets/panel.png) here")).toEqual([
      { kind: "text", text: "See " }, { kind: "image", src: "../assets/panel.png", alt: "The panel" }, { kind: "text", text: " here" },
    ]);
    expect(plainText("![The **panel**](../assets/panel.png)")).toBe("The panel");
  });

  it("turns a page into searchable plain text", () => {
    expect(plainText("# Memory\n\n- Pin **facts**\n\n| A |\n|---|\n| cell |")).toBe("Memory\nPin facts \nA cell");
  });
});
