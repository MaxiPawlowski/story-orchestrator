#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_FILES = [".st-root", "test/sessions/adolion-stories.json"];

const USAGE = `npm run worktree:setup
  Readies a git worktree to run the gates: junctions node_modules to the main checkout and copies the
  gitignored files the tests read (${LOCAL_FILES.join(", ")}). Never overwrites a file the worktree
  already has. Run it once after git worktree add.`;

export function setupPlan(worktree, main, exists = existsSync) {
  if (resolve(worktree) === resolve(main)) return { main, worktree, actions: [], refused: "this is the main checkout" };
  const actions = [];
  if (!exists(join(worktree, "node_modules")) && exists(join(main, "node_modules"))) actions.push({ kind: "junction", path: "node_modules" });
  for (const path of LOCAL_FILES) {
    if (exists(join(worktree, path))) continue;
    actions.push(exists(join(main, path)) ? { kind: "copy", path } : { kind: "missing", path });
  }
  return { main, worktree, actions };
}

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function main() {
  if (process.argv.includes("--help")) {
    console.log(USAGE);
    return 0;
  }
  const worktree = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  const mainCheckout = dirname(resolve(worktree, git(worktree, ["rev-parse", "--git-common-dir"])));
  const plan = setupPlan(worktree, mainCheckout);
  for (const action of plan.actions) {
    const target = join(worktree, action.path);
    if (action.kind === "junction") {
      if (process.platform === "win32") execFileSync("cmd", ["/c", "mklink", "/J", target, join(mainCheckout, action.path)], { stdio: "ignore" });
      else symlinkSync(join(mainCheckout, action.path), target, "dir");
    } else if (action.kind === "copy") {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(mainCheckout, action.path), target);
    }
  }
  console.log(JSON.stringify(plan, null, 1));
  return plan.refused || plan.actions.some((action) => action.kind === "missing") ? 1 : 0;
}

const invoked = process.argv[1] ? process.argv[1].replace(/\\/g, "/").toLowerCase() : "";
if (fileURLToPath(import.meta.url).replace(/\\/g, "/").toLowerCase() === invoked) process.exitCode = main();
