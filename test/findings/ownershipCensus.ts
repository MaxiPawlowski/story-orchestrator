// v2.3 plan 03: the census of every place that writes AFTER an await.
//
// Such a write is a claim about a world that may have moved while the await was open — a chat
// switch, a story swap, a restart, a rollback. C1 was one of these, found by reading; there are
// seventy, and reading is not a method. The census enumerates them from the AST so the set cannot
// drift quietly, and `ownership-sites.json` records what has been done about each one.
//
// This is deliberately a census, not a rule that every site must pass today: a guard that fails
// on seventy known sites gets switched off in a week. It fails on a site nobody has classified.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";

export interface OwnershipSite {
  key: string;
  file: string;
  name: string;
  writes: string[];
  hasTokenCheck: boolean;
}

// V3 (2026-09-23): `src/extraction` and `src/generation` joined, because V2's unowned read lived in
// `ExtractionScheduler.pump`, outside the roots the census had. `src/services/stHost` is left out on
// purpose: those are host primitives that take no ownership by design, and every caller of one is
// censused here. The pure packages (engine, memory, judge, …) hold no state across an await.
export const CENSUS_ROOTS = ["src/runtime", "src/wizard", "src/extraction", "src/generation", "src/copilot/agent"];

// A name that mutates something. Deliberately broad: a false positive costs one classified row,
// a false negative costs a silent cross-chat write.
const WRITE_NAME = /^(set|add|push|record|inject|enqueue|persist|save|apply|write|update|clear|remove|mark|commit|schedule|notify|bump|upsert|activate|bind|create|delete|force|append|patch|queue|fire|emit|replace|drop|disable|enable|toggle|store|put|insert|announce|revert|prune|reset)/i;

// What "this function checks ownership" looks like. `withToken` is the sanctioned wrapper, and
// `ownsOpenChat` is the narrower question `persist` asks: not "is this token still valid" but
// "does this run own the chat ST has open". Both are named forms on purpose — a check has to be
// greppable to be auditable, and a bare `if (chatId !== something)` is not.
// `stillOwns` / `lapsed` are the `RunGuard` check forms. `beginRun` is deliberately NOT here:
// minting a token and never asking it anything is precisely the defect, so a function that only
// mints must still read as unchecked.
// The CALL form, not the bare word: `stagecraftCoordinator.runWardenPass` has a local named
// `lapsed` meaning a lapsed continuity note, and a bare-word match read that as an ownership
// check (caught 2026-09-20). A name-based heuristic has to assume the domain will reuse its
// words, so it matches `run.lapsed()` and never `lapsed`.
const TOKEN_CHECK = /(\bwithToken\(|\btokenMatches\(|ownership\??\.check\(|\.ownsOpenChat\(|\.stillOwns\(|\.lapsed(Detail)?\()/;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry).split("\\").join("/");
    if (statSync(path).isDirectory()) walkFiles(path, out);
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const isFunctionLike = (node: ts.Node): node is ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression =>
  ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);

/** A body's code without its comments: a comment that NAMES a check form is not a check (V3). Leaf
 *  tokens carry no trivia, so joining them drops every comment and keeps every string. */
function codeOnly(node: ts.Node, source: ts.SourceFile): string {
  const parts: string[] = [];
  const leaf = (current: ts.Node) => {
    if (ts.isJSDoc(current)) return;
    const children = current.getChildren(source);
    if (!children.length) parts.push(current.getText(source));
    else children.forEach(leaf);
  };
  leaf(node);
  return parts.join(" ").replace(/\s*([.(?])\s*/g, "$1");
}

/** A write the call-name heuristic cannot see: `this.x = …`, `obj.y = …`, `map[key] = …` (V3). */
const assignedProperty = (node: ts.Node, source: ts.SourceFile): string | null => {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind < ts.SyntaxKind.FirstAssignment || node.operatorToken.kind > ts.SyntaxKind.LastAssignment) return null;
  return ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left) ? `=${node.left.getText(source)}` : null;
};

/**
 * What a function is called in the ledger. Methods and function declarations keep the names every
 * existing row uses; an arrow or function expression is named by where it lives (V3): a class
 * property (`Class.prop`), a property of an object held by one (`Class.deps.key`), a variable, a
 * slash-command callback by its command (`callback[cp]`), or the call it is handed to
 * (`Class.method>withLedger`). Two of one name in one file are told apart by `~2`.
 */
function functionName(node: ts.Node, source: ts.SourceFile, path: string[]): string {
  const parent = node.parent;
  const within = (name: string) => [...path, name].join(".");
  if (ts.isMethodDeclaration(node)) return within(node.name.getText(source));
  if (ts.isFunctionDeclaration(node)) return node.name?.getText(source) ?? "?";
  if (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) return within(parent.name.getText(source));
  if (ts.isPropertyAssignment(parent)) {
    const sibling = ts.isObjectLiteralExpression(parent.parent)
      ? parent.parent.properties.find((property) => ts.isPropertyAssignment(property) && property.name.getText(source) === "name" && ts.isStringLiteral(property.initializer))
      : undefined;
    const label = sibling && ts.isPropertyAssignment(sibling) && ts.isStringLiteral(sibling.initializer) ? `[${sibling.initializer.text}]` : "";
    return within(`${parent.name.getText(source)}${label}`);
  }
  if (ts.isCallExpression(parent)) return `${path.join(".") || "(module)"}>${parent.expression.getText(source).split(".").pop()}`;
  return `${path.join(".") || "(module)"}>anonymous`;
}

/** Every `file#function` in the census roots that writes after an await. */
export function censusSites(roots: string[] = CENSUS_ROOTS): OwnershipSite[] {
  const sites: OwnershipSite[] = [];
  for (const root of roots) {
    for (const file of walkFiles(root)) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf-8"), ts.ScriptTarget.ES2022, true);
      const seen = new Map<string, number>();
      const inspect = (owner: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression, name: string) => {
        const body = owner.body;
        if (!body) return;
        let sawAwait = false;
        const writes = new Set<string>();
        const walk = (node: ts.Node) => {
          if (ts.isAwaitExpression(node)) sawAwait = true;
          if (sawAwait && ts.isCallExpression(node)) {
            const called = node.expression.getText(source).split(".").pop() ?? "";
            if (WRITE_NAME.test(called)) writes.add(called);
          }
          const assigned = sawAwait ? assignedProperty(node, source) : null;
          if (assigned) writes.add(assigned);
          // A nested function is its own unit of ownership, so it is censused separately.
          if (node !== owner && isFunctionLike(node)) return;
          node.forEachChild(walk);
        };
        body.forEachChild(walk);
        if (!sawAwait || !writes.size) return;
        const count = (seen.get(name) ?? 0) + 1;
        seen.set(name, count);
        const unique = count === 1 ? name : `${name}~${count}`;
        sites.push({ key: `${file}#${unique}`, file, name: unique, writes: [...writes].sort(), hasTokenCheck: TOKEN_CHECK.test(codeOnly(body, source)) });
      };
      const visit = (node: ts.Node, path: string[]) => {
        if (isFunctionLike(node)) {
          const name = functionName(node, source, path);
          inspect(node, name);
          const scope = ts.isFunctionDeclaration(node) ? [name] : name.split(">")[0].split(".").filter(Boolean);
          node.forEachChild((child) => visit(child, scope.length ? scope : path));
          return;
        }
        if (ts.isClassDeclaration(node)) {
          node.forEachChild((child) => visit(child, [node.name?.getText(source) ?? "?"]));
          return;
        }
        if ((ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
          node.forEachChild((child) => visit(child, [...path, node.name.getText(source)]));
          return;
        }
        node.forEachChild((child) => visit(child, path));
      };
      visit(source, []);
    }
  }
  return sites.sort((a, b) => a.key.localeCompare(b.key));
}
