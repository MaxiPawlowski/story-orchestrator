import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// v2.3 plan 06. R3 was a `false` read as success: a host call that answered "no" and a host call that
// answered "yes" were the same value to its caller. Every host WRITE therefore answers with a result
// that says whether it reached the host and, when it did not, why — `{ok: true, …} | {ok: false,
// reason}` (see `writeResult.ts`) or a named-outcome union such as `upsertWIEntry`'s
// `"created" | "updated" | "unchanged" | "failed"`.
//
// A READ is not a write: a question ("does this lorebook exist?", "is the host generating?") is
// answered yes or no and that IS the whole answer. Those are listed below with the reason they may
// stay boolean, so the list is a set of decisions rather than a set of omissions. So are the writes
// that never touch ST's own state — the drawers bind OUR toggle, and macro registration is our own
// name in ST's table — because there is nothing a caller could do with a failure it cannot already
// see from the DOM or the next render.

const DIR = join(__dirname);

/** The event name `settingsReady` waits on; not a function at all. */
const NOT_FUNCTIONS = new Set(["EXTENSION_SETTINGS_LOADED_EVENT"]);

const READS: Record<string, string> = {
  backgroundExists: "a question about the install's backgrounds",
  lorebookExists: "a question about the install's lorebooks",
  isHostGenerating: "a question about ST's generating flag",
  willAddUserMessage: "a question about what ST will do with this generation",
  executeSlashCommands: "the command interface itself: its boolean IS the answer, and every write seam turns it into a typed result",
  findTextGenPreset: "a lookup, not a write",
  getContext: "the host context accessor itself, not a write",
  showConfirmPopup: "a QUESTION: its boolean is the user's answer, which is the whole answer",
  registerHostMacro: "our own name in ST's macro table, re-registered on every start; a failure is visible as an unresolved macro",
  unregisterHostMacro: "the inverse of the above, on the same table",
  bindNavbarDrawerToggle: "binds OUR toggle's click; the toggle is in our own DOM",
  toggleNavbarDrawer: "opens OUR drawer; the result is on screen",
  settingsReady: "a GATE, not a write: it resolves when ST has loaded the extension settings, and it is what a reader waits on before touching them",
  settingsAreLoaded: "a question about that gate",
  vectorInsert: "a THROWING seam: a failed write raises, and `buildMatchSets` catches it to fall back to keyword overlap. A result object would have to be checked at the throw site to keep that fallback",
  vectorPurge: "the same, and it is best-effort by contract: its caller already swallows the throw",
};

// The declaration, so a wrapped signature is read whole.
const DECLARATION = /^export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/;
const UNTYPED = /: *(boolean|void|Promise<boolean>|Promise<void>)\s*(?:=>|\{)/;

const files = readdirSync(DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

interface Offender {
  file: string;
  name: string;
  line: string;
}

/**
 * One declaration at a time, and only its OWN type text: every declaration ends at the `=` or the
 * opening brace that follows it, so a neighbouring `Promise<void>` cannot be read as this one's
 * answer. (Reading a fixed window of lines instead reported three neighbours of `settingsReady` as
 * offenders — the guard's own version of the mistake it exists to catch.)
 */
const declarationType = (file: string, name: string): string | null => {
  const source = readFileSync(join(DIR, file), "utf8").replace(/\r\n/g, "\n");
  const start = source.search(new RegExp(`^export\\s+(?:async\\s+)?(?:function|const|let)\\s+${name}\\b`, "m"));
  if (start === -1) return null;
  const rest = source.slice(start);
  const end = rest.search(/=>|\{|=\s*[^(]/);
  return (end === -1 ? rest.slice(0, 200) : rest.slice(0, end)).replace(/\s+/g, " ");
};

function offenders(): Offender[] {
  const found: Offender[] = [];
  for (const file of files) {
    const names = [...readFileSync(join(DIR, file), "utf8").matchAll(new RegExp(DECLARATION.source, "gm"))].map((match) => match[1]);
    for (const name of names) {
      if (READS[name] || NOT_FUNCTIONS.has(name)) continue;
      const declaration = declarationType(file, name);
      if (!declaration || !UNTYPED.test(declaration)) continue;
      found.push({ file, name, line: declaration });
    }
  }
  return found;
}

describe("host write results are typed (v2.3 plan 06)", () => {
  it("no stHost write answers with a bare boolean or void", () => {
    expect(offenders().map((entry) => `${entry.file}: ${entry.name} — ${entry.line.slice(0, 140)}`)).toEqual([]);
  });

  it("the guard recognises a bare write and passes a typed one", () => {
    for (const text of ["export function doThing(): boolean {", "export const doThing = async (): Promise<void> => {", "export async function doThing(): Promise<boolean> {"]) {
      expect(UNTYPED.test(text)).toBe(true);
    }
    for (const text of ["export function doThing(): WriteResult {", "export async function doThing(): Promise<WriteResult<{ from: string }>> {", "export async function doThing(): Promise<\"created\" | \"failed\"> {"]) {
      expect(UNTYPED.test(text)).toBe(false);
    }
    expect(DECLARATION.exec("export const readThing = (): boolean => true")?.[1]).toBe("readThing");
  });

  it("every read on the allowlist is still a real export", () => {
    const missing = Object.keys(READS).filter((name) => !files.some((file) => new RegExp(`\\b${name}\\b`).test(readFileSync(join(DIR, file), "utf8"))));
    expect(missing).toEqual([]);
  });
});
