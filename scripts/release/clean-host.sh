#!/usr/bin/env bash
# v2.3 plan 08. The clean-host question, answered by measurement instead of argument: clone SillyTavern
# at a pinned commit into a temp dir, drop this extension in at the third-party path, install with an
# isolated cache, and run every gate there. The review could not typecheck or build on an isolated host;
# this is the check that says whether that was the host or the code.
#
# Usage:
#   scripts/release/clean-host.sh [--ref <commit|branch|tag>] [--keep] [--gates <list>] [--store <dir>]
#
#   --ref    SillyTavern revision to pin (default: $ST_REF, else the origin default branch)
#   --keep   leave the checkout in place for inspection
#   --gates  comma-separated subset of: typecheck,lint,test,build,storybook,release
#   --store  where the run logs and the host record are written (default: docs/release/<version>/clean-host)
set -uo pipefail

EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ST_REPO="${ST_REPO:-https://github.com/SillyTavern/SillyTavern.git}"
ST_REF="${ST_REF:-}"
GATES="typecheck,lint,test,build,release"
KEEP=0
STORE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) ST_REF="$2"; shift 2 ;;
    --gates) GATES="$2"; shift 2 ;;
    --store) STORE="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# The logs are release evidence, so they live under the extension version they were run against
# (v2.3 plan 08: `docs/release/<version>/`).
# `node -p require(...)` cannot resolve a Git Bash `/c/...` path, so the version is read with sed.
VERSION="$(grep -m1 '"version"' "$EXT_DIR/package.json" | sed 's/[^0-9.]//g')"
[ -n "$VERSION" ] || VERSION="unknown"
[ -n "$STORE" ] || STORE="$EXT_DIR/docs/release/$VERSION/clean-host"
# Absolute from here on. The gates run from the clone, and a relative --store would then write the
# log into the temp checkout and delete it with the trap (measured: a green older-host run whose
# record went missing).
case "$STORE" in
  /*|[A-Za-z]:/*) ;;
  *) STORE="$EXT_DIR/$STORE" ;;
esac
mkdir -p "$STORE"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$STORE/$STAMP.log"
HOST_RECORD="$STORE/$STAMP.host.json"
WORK="$(mktemp -d)"
CLONE="$WORK/SillyTavern"
TARGET="$CLONE/public/scripts/extensions/third-party/story-orchestrator"

say() { echo "[clean-host] $*" | tee -a "$LOG"; }

status=0
cleanup() {
  if [ "$KEEP" -eq 1 ]; then say "keeping $CLONE"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

say "extension: $EXT_DIR"
say "log: $LOG"

ST_COMMIT=""
{
  echo "== clone =="
  git clone --quiet "$ST_REPO" "$CLONE" || { say "clone failed"; exit 1; }
  if [ -n "$ST_REF" ]; then git -C "$CLONE" checkout --quiet "$ST_REF" || { say "checkout $ST_REF failed"; exit 1; }; fi
  ST_COMMIT="$(git -C "$CLONE" rev-parse HEAD)"
  say "SillyTavern $ST_COMMIT ($(git -C "$CLONE" rev-parse --abbrev-ref HEAD))"
} >>"$LOG" 2>&1
ST_BRANCH="$(git -C "$CLONE" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

mkdir -p "$(dirname "$TARGET")"
# The extension is copied WITHOUT node_modules, dist and .debug: a clean host has none of them, and
# copying dist would defeat the build gate by handing it a bundle it did not make.
say "== copy extension =="
tar -C "$EXT_DIR" --exclude=node_modules --exclude=dist --exclude=.debug --exclude=.sb-static --exclude=.git -cf - . | tar -C "$(mkdir -p "$TARGET" && echo "$TARGET")" -xf - >>"$LOG" 2>&1

if [ -n "${ST_PUBLIC:-}" ]; then say "ST_PUBLIC was set in the environment; unsetting it for the gates"; unset ST_PUBLIC; fi

cd "$TARGET" || exit 1

run_gate() {
  local name="$1"; shift
  say "== $name =="
  if "$@" >>"$LOG" 2>&1; then
    say "$name OK"
  else
    say "$name FAILED"
    status=1
  fi
}

run_gate "npm ci" npm ci --no-audit --no-fund --cache "$WORK/npm-cache"

case ",$GATES," in *,typecheck,*) run_gate "typecheck" npm run typecheck ;; esac
case ",$GATES," in *,lint,*) run_gate "lint" npm run lint ;; esac
case ",$GATES," in *,test,*) run_gate "test" npm test ;; esac
case ",$GATES," in *,build,*) run_gate "build" npm run build ;; esac
case ",$GATES," in *,release,*) run_gate "test:release" npm run test:release ;; esac
case ",$GATES," in *,storybook,*) run_gate "test-storybook:ci" npm run test-storybook:ci ;; esac

# The record: what host this was, what the extension was, and which of its host seams have moved.
say "== host record =="
node - "$CLONE" "$TARGET" "$STORE" "$STAMP" "$status" "$ST_COMMIT" "$ST_BRANCH" <<'NODE' >>"$LOG" 2>&1
const { readFileSync, writeFileSync, existsSync, readdirSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");
const [clone, target, store, stamp, status, commit, branch] = process.argv.slice(2);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const stPkg = existsSync(join(clone, "package.json")) ? JSON.parse(readFileSync(join(clone, "package.json"), "utf8")) : null;
const extPkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
const seams = join(target, "src", "services", "stHost");
const paths = new Set();
for (const name of readdirSync(seams).filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))) {
  const text = readFileSync(join(seams, name), "utf8");
  for (const match of text.matchAll(/importSTModule<[^>]*>\(\s*"([^"]+)"/g)) paths.add(match[1]);
}
const hashes = {};
for (const hostPath of [...paths].sort()) {
  const file = join(clone, "public", hostPath.replace(/^\//, ""));
  hashes[hostPath] = existsSync(file) ? sha256(readFileSync(file)) : null;
}
writeFileSync(join(store, `${stamp}.host.json`), `${JSON.stringify({
  kind: "clean-host-record",
  at: new Date().toISOString(),
  status: status === "0" ? "green" : "failed",
  host: { dir: clone, sha: commit || null, branch: branch || null, version: stPkg?.version ?? null },
  extension: { version: extPkg.version },
  hostFiles: hashes,
  manifest: existsSync(join(target, "dist", "manifest.json")) ? JSON.parse(readFileSync(join(target, "dist", "manifest.json"), "utf8")) : null,
}, null, 2)}\n`);
NODE

say "host record: $HOST_RECORD"
say "result: $([ "$status" -eq 0 ] && echo green || echo FAILED)"
exit "$status"
