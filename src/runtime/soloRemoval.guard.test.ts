import { readFileSync } from "fs";
import { join } from "path";
import * as ts from "typescript";
import { parse, rel, sourceFiles, SRC } from "../../test/support/codeHealth";

const REMOVED_MODULES: string[] = [];

const REMOVED_DEFINITIONS = [
  { file: "src/memory/epistemic.ts", symbol: "renderSoloEpistemicBlock" },
  { file: "src/memory/epistemic.ts", symbol: "renderAttributedEpistemicBlock" },
  { file: "src/memory/innerRender.ts", symbol: "soloAims" },
  { file: "src/memory/innerRender.ts", symbol: "renderCastAims" },
  { file: "src/runtime/memoryInjector.ts", symbol: "onSoloGeneration" },
  { file: "src/runtime/memoryInjector.ts", symbol: "soloBlock" },
  { file: "src/runtime/coordinators/pacingCoordinator.ts", symbol: "soloMember" },
  { file: "src/runtime/managerWiring.ts", symbol: "soloMember" },
];

const SELF = "src/runtime/soloRemoval.guard.test.ts";
const SYMBOLS = new Set(REMOVED_DEFINITIONS.map((entry) => entry.symbol));

type Read = (path: string) => string;
const diskRead: Read = (path) => readFileSync(path, "utf8");

const allSources = () => sourceFiles(SRC).filter((path) => /\.tsx?$/.test(path) && rel(path) !== SELF);

const declaredName = (node: ts.Node): string | null => {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  if ((ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isPropertyAssignment(node) || ts.isMethodSignature(node))
    && (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name))) return node.name.text.replace(/^#/, "");
  if (ts.isShorthandPropertyAssignment(node)) return node.name.text;
  if (ts.isExportSpecifier(node)) return node.name.text;
  return null;
};

const perFile = (scan: (path: string, text: string) => string[]) => {
  const seen = new Map<string, { text: string; found: string[] }>();
  return (files: string[], read: Read = diskRead): string[] => files.flatMap((path) => {
    const text = read(path);
    const cached = seen.get(path);
    if (cached && cached.text === text) return cached.found;
    const found = scan(path, text);
    seen.set(path, { text, found });
    return found;
  });
};

const declarationsOf = perFile((path, text) => {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const name = declaredName(node);
    if (name && SYMBOLS.has(name)) found.push(`${rel(path)}#${name}`);
    ts.forEachChild(node, visit);
  };
  visit(parse(path, text));
  return found;
});

const removedModule = (specifier: string): string | null => {
  const bare = specifier.replace(/^@(\w+)\//, "src/$1/").replace(/\.tsx?$/, "");
  return REMOVED_MODULES.find((module) => module.replace(/\.tsx?$/, "").endsWith(bare.replace(/^(\.\.?\/)+/, ""))) ?? null;
};

const importsOf = perFile((path, text) => {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const module = removedModule(node.moduleSpecifier.text);
      if (module) found.push(`${rel(path)} imports ${module}`);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        bindings.elements.filter((element) => SYMBOLS.has((element.propertyName ?? element.name).text))
          .forEach((element) => found.push(`${rel(path)} imports ${(element.propertyName ?? element.name).text}`));
      }
    }
    if (ts.isPropertyAccessExpression(node) && SYMBOLS.has(node.name.text)) found.push(`${rel(path)} uses .${node.name.text}`);
    ts.forEachChild(node, visit);
  };
  visit(parse(path, text));
  return found;
});

describe("v2.7 plan 03 (D3, R3-16): solo-only code stays removed", () => {
  const files = allSources();

  it("no removed module exists under src/", () => {
    const present = new Set(files.map(rel));
    expect(REMOVED_MODULES.filter((module) => present.has(module))).toEqual([]);
  });

  it("no removed definition is declared or exported anywhere under src/, tests included", () => {
    expect(declarationsOf(files)).toEqual([]);
  });

  it("no module imports or calls a removed definition or module", () => {
    expect(importsOf(files)).toEqual([]);
  });

  it("control: a planted unused definition (re-declared and exported in an untouched module, imported by nobody) fails the absence check", () => {
    const planted = join(SRC, "utils", "log.ts");
    const read: Read = (path) => (path === planted ? `${diskRead(path)}\nexport const renderSoloEpistemicBlock = (): string => "";\n` : diskRead(path));
    expect(declarationsOf(files, read)).toEqual(["src/utils/log.ts#renderSoloEpistemicBlock"]);
    expect(importsOf(files, read)).toEqual([]);
  });

  it("control: a planted import of a removed definition fails the import check", () => {
    const planted = join(SRC, "runtime", "memoryInjector.ts");
    const read: Read = (path) => (path === planted ? `import { soloAims } from "@memory/innerRender";\n${diskRead(path)}` : diskRead(path));
    expect(importsOf(files, read)).toEqual(["src/runtime/memoryInjector.ts imports soloAims"]);
  });

  it("control: a planted call of a removed method fails the import check", () => {
    const planted = join(SRC, "runtime", "runtimeManager.ts");
    const read: Read = (path) => (path === planted ? `${diskRead(path)}\nexport const plantedSolo = (manager: { injector: { onSoloGeneration(): void } }) => manager.injector.onSoloGeneration();\n` : diskRead(path));
    expect(importsOf(files, read)).toContain("src/runtime/runtimeManager.ts uses .onSoloGeneration");
  });

  it("every listed definition names a file that still exists (the list is about definitions removed from files that stay)", () => {
    const present = new Set(files.map(rel));
    expect(REMOVED_DEFINITIONS.filter((entry) => !present.has(entry.file))).toEqual([]);
  });
});
