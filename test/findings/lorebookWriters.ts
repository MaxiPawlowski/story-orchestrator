import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

export const LOREBOOK_WRITERS = [
  "createLorebook", "ensureLorebook", "deleteLorebook",
  "upsertWIEntry", "createWIEntry", "updateWIEntryByUid", "restoreWIEntryAt", "deleteWIEntryAt",
  "setWIEntriesState", "enableWIEntry", "disableWIEntry", "setLorebookEntriesDisabled",
  "bindChatLorebook", "unbindChatLorebook", "deactivateGlobalLorebook", "forceActivateEntries",
] as const;

const WRITERS = new Set<string>(LOREBOOK_WRITERS);

export interface WriterSite {
  key: string;
  file: string;
  writer: string;
  lines: number[];
}

const skipped = (path: string) => /\.(test|stories)\.tsx?$/.test(path) || path.includes("/services/");

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry).split("\\").join("/");
    if (statSync(path).isDirectory()) walkFiles(path, out);
    else if (/\.tsx?$/.test(path) && !skipped(path)) out.push(path);
  }
  return out;
}

const declaresOnly = (node: ts.Identifier): boolean => {
  const parent = node.parent;
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent)) return true;
  if ((ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) && parent.name === node) return true;
  if (ts.isTypeQueryNode(parent) || ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)) return true;
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) return true;
  if ((ts.isFunctionDeclaration(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent)) && parent.name === node) return true;
  return false;
};

export function writerSitesIn(file: string, text: string): WriterSite[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = new Map<string, WriterSite>();
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && WRITERS.has(node.text) && !declaresOnly(node)) {
      const key = `${file}#${node.text}`;
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const site = found.get(key) ?? { key, file, writer: node.text, lines: [] };
      site.lines.push(line);
      found.set(key, site);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return [...found.values()];
}

export function lorebookWriterSites(root = "src"): WriterSite[] {
  return walkFiles(root).flatMap((file) => writerSitesIn(file, readFileSync(file, "utf-8"))).sort((a, b) => a.key.localeCompare(b.key));
}
