import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT } from "./stRoot.mjs";

const SCRIPTS = join(REPO_ROOT, "scripts");

const RAW_WRITERS = ["writeFile", "writeFileSync", "cp", "cpSync", "copyFile", "copyFileSync", "rm", "rmSync", "rmdir", "rmdirSync", "unlink", "unlinkSync", "mkdir", "mkdirSync", "rename", "renameSync", "appendFile", "appendFileSync", "open", "openSync", "createWriteStream", "symlink", "symlinkSync", "truncate", "truncateSync"];

const TOUCHES_LANES = /lanes?Root|LANES_ROOT|lanePaths|default-user|dataRoot/;

const EXEMPT = {
  "release/inventory.mjs": "reads a data root only (openSync 'r'), writes nothing",
  "debug/so-sprite-copy.mts": "the owner's own copy from a lane into the owner's install, only with --confirm and COPYFILE_EXCL; not a lane writer",
  "debug/so-size-budget.mts": "measures data roots read-only; writes only its --out report",
  "local/backup.mjs": "local controller backup: reads the owner's settings, writes the backup outside ST data",
  "local/route-st.mjs": "owner-run routing tool that edits the owner's own ST settings on purpose; not a lane writer",
  "local/storyWorkflowLi.mjs": "reads a lane's settings and workflows, writes reports to its out dir only",
};

export function rawWriterImports(source) {
  const found = [];
  for (const match of source.matchAll(/import\s+(?:\{([^}]*)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+["'](node:)?fs(\/promises)?["']/g)) {
    if (match[2] || match[3]) found.push(`namespace ${match[2] ?? match[3]}`);
    else for (const name of match[1].split(",").map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean)) if (RAW_WRITERS.includes(name)) found.push(name);
  }
  if (/require\(\s*["'](node:)?fs(\/promises)?["']\s*\)/.test(source)) found.push("require(fs)");
  return found;
}

export const isLaneWriter = (source) => TOUCHES_LANES.test(source) && rawWriterImports(source).length > 0;

function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "node_modules") out.push(...sources(path)); continue; }
    if (!/\.(mts|mjs|ts|js)$/.test(entry.name) || /\.test\.|\.d\.mts$/.test(entry.name) || entry.name === "laneSafety.mjs") continue;
    out.push(path);
  }
  return out;
}

test("planted controls: a lane writer importing raw fs writers is caught, a guarded one is not", () => {
  assert.equal(isLaneWriter("import { writeFile } from 'node:fs/promises';\nconst p = resolve(LANES_ROOT, '1');"), true);
  assert.equal(isLaneWriter("import * as fs from 'node:fs';\nconst u = 'data/default-user';"), true);
  assert.equal(isLaneWriter("import { readFile, rm as remove } from \"fs/promises\";\nlaneRoot;"), true);
  assert.equal(isLaneWriter("const fs = require('node:fs'); lanesRoot;"), true);
  assert.equal(isLaneWriter("import { readFile } from 'node:fs/promises';\nimport { laneFs } from '../lib/laneSafety.mjs';\nconst { writeFile } = laneFs;\nLANES_ROOT;"), false);
  assert.equal(isLaneWriter("import { writeFile } from 'node:fs/promises';\nconst out = 'report.json';"), false);
});

test("every script that touches lane or ST data roots writes only through laneSafety (laneFs / harnessFs)", () => {
  const offenders = [];
  for (const path of sources(SCRIPTS)) {
    const rel = relative(SCRIPTS, path).replace(/\\/g, "/");
    const source = readFileSync(path, "utf8");
    if (!isLaneWriter(source) || EXEMPT[rel]) continue;
    offenders.push(`${rel}: ${rawWriterImports(source).join(", ")}`);
  }
  assert.deepEqual(offenders, [], "route these writes through scripts/lib/laneSafety.mjs (laneFs for lane data, harnessFs elsewhere), or add an EXEMPT row with a reason");
});

test("exempt rows name files that exist and still need the exemption", () => {
  for (const rel of Object.keys(EXEMPT)) {
    const source = readFileSync(join(SCRIPTS, rel), "utf8");
    assert.ok(TOUCHES_LANES.test(source), `${rel} no longer touches lane paths: drop its EXEMPT row`);
  }
});

test("the lane writers named by the 2026-11-01 incident import laneSafety", () => {
  for (const rel of ["debug/st-lanes.mts", "debug/adolion-fresh.mts", "debug/lib/laneBundle.mts", "debug/lib/sessionLanes.mts", "debug/so-bundle-route.mts", "suite/nomodel.mjs"]) {
    const source = readFileSync(join(SCRIPTS, rel), "utf8");
    assert.match(source, /laneFs\b[^;]*from ["'][./]*\/?lib\/laneSafety\.mjs["']|import \{[^}]*laneFs[^}]*\} from ["'][^"']*laneSafety\.mjs["']/, `${rel} must take its writers from laneFs`);
    assert.deepEqual(rawWriterImports(source), [], `${rel} imports raw fs writers`);
  }
  assert.match(readFileSync(join(SCRIPTS, "debug/st-lanes.mts"), "utf8"), /assertServedTree\(ST_ROOT\)/);
});
