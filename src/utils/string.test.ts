import { clipText, lorebookFileId, quoteSlashArg, runsAsCommand, truncate } from "./string";

describe("harvest 2026-11-08 B3: lorebookFileId follows ST's sanitize(name + \".json\")", () => {
  it("drops illegal and control characters and keeps edge spaces, which the server keeps too", () => {
    expect(lorebookFileId("Who: Me?")).toBe("Who Me");
    expect(lorebookFileId(" Book ")).toBe(" Book ");
    expect(lorebookFileId("Tab\u0007Book")).toBe("TabBook");
  });

  it("caps the file name at 255 UTF-8 bytes, ext included, the way the server files it", () => {
    const long = "a".repeat(260);
    expect(lorebookFileId(long)).toBe("a".repeat(255));
    expect(lorebookFileId("a".repeat(250))).toBe("a".repeat(250));
    expect(lorebookFileId("é".repeat(200))).toBe("é".repeat(127));
  });

  it("a reserved Windows name sanitises to nothing", () => {
    expect(lorebookFileId("con")).toBe("");
  });
});

describe("harvest 2026-11-08: clipping never leaves half of a surrogate pair", () => {
  it("drops a high surrogate the cut would leave at the end", () => {
    expect(clipText("ab\u{1F600}cd", 3)).toBe("ab");
    expect(truncate("ab\u{1F600}cd", 3)).toBe("ab…");
  });

  it("keeps a whole pair and plain text as they were", () => {
    expect(clipText("ab\u{1F600}cd", 4)).toBe("ab\u{1F600}");
    expect(clipText("abcdef", 3)).toBe("abc");
    expect(truncate("abc", 5)).toBe("abc");
  });
});

const decodeStrictQuotedArg = (encoded: string): string => {
  if (!encoded.startsWith('"')) throw new Error("not a quoted value");
  let out = "";
  let index = 1;
  while (index < encoded.length) {
    let run = 0;
    while (encoded[index + run] === "\\") run += 1;
    if (encoded[index + run] === '"') {
      out += "\\".repeat(Math.floor(run / 2));
      index += run;
      if (run % 2 === 0) {
        if (index !== encoded.length - 1) throw new Error(`value closed early at ${index}`);
        return out.replace(/\\\{/g, "{").replace(/\\\}/g, "}");
      }
      out += '"';
      index += 1;
      continue;
    }
    if (run > 0) {
      out += "\\".repeat(run);
      index += run;
      continue;
    }
    out += encoded[index];
    index += 1;
  }
  throw new Error("Unexpected end of quoted value");
};

describe("runsAsCommand (B11)", () => {
  it("is true only when the first non-space character is a slash", () => {
    expect(runsAsCommand("/echo hi")).toBe(true);
    expect(runsAsCommand("  \n/sendas x")).toBe(true);
    expect(runsAsCommand("I say /bye")).toBe(false);
    expect(runsAsCommand("")).toBe(false);
  });
});

describe("quoteSlashArg", () => {
  it("keeps a pipe literal instead of escaping it, because the parser runs with strict escaping", () => {
    expect(quoteSlashArg("a | b")).toBe('"a | b"');
    expect(quoteSlashArg("a || b")).toBe('"a || b"');
  });

  it("escapes quotes", () => {
    expect(quoteSlashArg('say "hi"')).toBe('"say \\"hi\\""');
  });

  it("leaves backslashes alone unless a quote or the closing quote follows them", () => {
    expect(quoteSlashArg("C:\\path\\to")).toBe('"C:\\path\\to"');
    expect(quoteSlashArg('a\\"b')).toBe('"a\\\\\\"b"');
    expect(quoteSlashArg("ends with \\")).toBe('"ends with \\\\"');
    expect(quoteSlashArg("\\\\")).toBe('"\\\\\\\\"');
  });

  it("passes newlines through as real line breaks, never as backslash-n", () => {
    expect(quoteSlashArg("line one\nline two\r\nline three")).toBe('"line one\nline two\r\nline three"');
    expect(quoteSlashArg("literal \\n stays")).toBe('"literal \\n stays"');
  });

  it("escapes macro braces so the closure's macro pass leaves them for the command", () => {
    expect(quoteSlashArg("{{char}} and {{story_tension}}")).toBe('"\\{\\{char\\}\\} and \\{\\{story_tension\\}\\}"');
    expect(quoteSlashArg("{: /echo x :}")).toBe('"\\{: /echo x :\\}"');
  });

  it("quotes the empty string", () => {
    expect(quoteSlashArg("")).toBe('""');
  });

  it.each([
    "plain",
    "a | b || c",
    'quote " inside',
    'trailing quote"',
    "trailing backslash \\",
    "\\\\ double then text",
    'backslash then quote \\"',
    'two backslashes then quote \\\\"',
    "\\{{char}}",
    "\\{literal escaped brace\\}",
    "{{random::a|b}} | {{newline}}",
    "multi\nline\n\nwith | pipe and \"quotes\" and {{user}}",
    ":} {: /run x",
    "\\",
    '"',
    "\\\"\\",
  ])("round-trips %j through the strict parser rules", (text) => {
    expect(decodeStrictQuotedArg(quoteSlashArg(text))).toBe(text);
  });
});
