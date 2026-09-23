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

export const CENSUS_ROOTS = ["src/runtime", "src/wizard"];

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

/** Every `file#function` in the census roots that writes after an await. */
export function censusSites(roots: string[] = CENSUS_ROOTS): OwnershipSite[] {
  const sites: OwnershipSite[] = [];
  for (const root of roots) {
    for (const file of walkFiles(root)) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf-8"), ts.ScriptTarget.ES2022, true);
      const inspect = (body: ts.Node, owner: ts.Node, name: string) => {
        let sawAwait = false;
        const writes = new Set<string>();
        const walk = (node: ts.Node) => {
          if (ts.isAwaitExpression(node)) sawAwait = true;
          if (sawAwait && ts.isCallExpression(node)) {
            const called = node.expression.getText(source).split(".").pop() ?? "";
            if (WRITE_NAME.test(called)) writes.add(called);
          }
          // A nested function is its own unit of ownership, so it is censused separately.
          if (node !== owner && (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))) return;
          node.forEachChild(walk);
        };
        body.forEachChild(walk);
        if (!sawAwait || !writes.size) return;
        sites.push({ key: `${file}#${name}`, file, name, writes: [...writes].sort(), hasTokenCheck: TOKEN_CHECK.test(body.getText(source)) });
      };
      const top = (node: ts.Node) => {
        if (ts.isMethodDeclaration(node) && node.body) {
          const owner = ts.isClassDeclaration(node.parent) ? node.parent.name?.getText(source) ?? "?" : "?";
          inspect(node.body, node, `${owner}.${node.name.getText(source)}`);
        } else if (ts.isFunctionDeclaration(node) && node.body) {
          inspect(node.body, node, node.name?.getText(source) ?? "?");
        }
        node.forEachChild(top);
      };
      source.forEachChild(top);
    }
  }
  return sites.sort((a, b) => a.key.localeCompare(b.key));
}
