import { quoteSlashArg } from "./string";

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
