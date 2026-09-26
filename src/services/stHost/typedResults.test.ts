import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

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
  invalidateCapabilities: "clears OUR probe cache; nothing in ST changes",
  hostMacrosAvailable: "a question about the install: is the macro module there to register into",
  hostArgMacrosAvailable: "a question about the install: does the new macro engine expose macros.register (v2.5 plan 07 A2)",
  noteHostSettingsLoaded: "records that ST emitted its settings-loaded event, in our own flag",
  installSaveWatcher: "installs OUR observer on the save route; it writes nothing ST keeps",
  profileExists: "a question about the install's connection profiles (v2.4 plan 03 D1 preflight)",
};

// V17: the guard used to read the return type WRITTEN before `{` or `=>`, so an unannotated host write
// (`applyCharacterAN`, `applyBackground`, `enableWIEntry`, …) inferred `void` or `boolean` and passed.
// It now asks the checker for the INFERRED return type — awaited, and split into its union parts —
// and a function whose every part is boolean, void or undefined answers nothing a caller can act on.
const ROOT = join(DIR, "../../..");
const BARE = ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Void | ts.TypeFlags.Undefined;

const compilerOptions = (): ts.CompilerOptions => {
  const config = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
  return { ...ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT).options, noEmit: true };
};

const exportedFunctions = (source: ts.SourceFile): Array<{ name: string; node: ts.SignatureDeclaration }> => {
  const exported = (node: ts.Node) => (ts.canHaveModifiers(node) ? ts.getModifiers(node) ?? [] : []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  const found: Array<{ name: string; node: ts.SignatureDeclaration }> = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && exported(statement)) found.push({ name: statement.name.text, node: statement });
    if (ts.isVariableStatement(statement) && exported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) found.push({ name: declaration.name.text, node: init });
      }
    }
  }
  return found;
};

function bareFunctions(program: ts.Program, fileNames: string[]): Array<{ file: string; name: string; type: string }> {
  const checker = program.getTypeChecker();
  const found: Array<{ file: string; name: string; type: string }> = [];
  for (const fileName of fileNames) {
    const source = program.getSourceFile(fileName);
    if (!source) throw new Error(`the checker did not load ${fileName}`);
    for (const { name, node } of exportedFunctions(source)) {
      const signature = checker.getSignatureFromDeclaration(node);
      if (!signature) continue;
      const returned = checker.getReturnTypeOfSignature(signature);
      const awaited = (checker as ts.TypeChecker & { getAwaitedType(type: ts.Type): ts.Type | undefined }).getAwaitedType(returned) ?? returned;
      const parts = awaited.isUnion() ? awaited.types : [awaited];
      if (parts.every((part) => (part.flags & BARE) !== 0)) found.push({ file: fileName.split(/[\\/]/).pop() ?? fileName, name, type: checker.typeToString(returned) });
    }
  }
  return found;
}

const files = readdirSync(DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

function offenders() {
  const fileNames = files.map((name) => join(DIR, name));
  return bareFunctions(ts.createProgram(fileNames, compilerOptions()), fileNames).filter((entry) => !READS[entry.name] && !NOT_FUNCTIONS.has(entry.name));
}

const FIXTURE = `
export async function inferredVoid() { await Promise.resolve(); }
export const inferredBool = () => Math.random() > 0.5;
export const annotatedVoid = async (): Promise<void> => undefined;
export async function typed(): Promise<{ ok: true } | { ok: false; reason: string }> { return { ok: true }; }
export function named(): "created" | "failed" { return "created"; }
export const inferredTyped = async () => ({ ok: true as const, text: "x" });
`;

function fixtureOffenders(): string[] {
  const options = compilerOptions();
  const host = ts.createCompilerHost(options);
  const name = join(DIR, "__typed_results_fixture__.ts").split("\\").join("/");
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, language, onError, create) => (fileName === name ? ts.createSourceFile(fileName, FIXTURE, language) : read(fileName, language, onError, create));
  const exists = host.fileExists.bind(host);
  host.fileExists = (fileName) => fileName === name || exists(fileName);
  return bareFunctions(ts.createProgram([name], options, host), [name]).map((entry) => entry.name);
}

describe("host write results are typed (v2.3 plan 06, inferred since V17)", () => {
  it("no stHost write answers with a bare boolean or void, written or inferred", () => {
    expect(offenders().map((entry) => `${entry.file}: ${entry.name} — ${entry.type}`)).toEqual([]);
  }, 60000);

  it("the guard catches an INFERRED bare write, and passes a typed one written or inferred", () => {
    expect(fixtureOffenders()).toEqual(["inferredVoid", "inferredBool", "annotatedVoid"]);
  }, 60000);

  it("every read on the allowlist is still a real export", () => {
    const missing = Object.keys(READS).filter((name) => !files.some((file) => new RegExp(`\\b${name}\\b`).test(readFileSync(join(DIR, file), "utf8"))));
    expect(missing).toEqual([]);
  });
});
