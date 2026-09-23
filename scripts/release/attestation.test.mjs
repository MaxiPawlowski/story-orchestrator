// v2.3 plan 11. Plan 08's manifest is checked against the bytes it describes; the attestation is the
// second file of the pair and needs the same treatment, because everything it claims is a claim about
// files. A citation to a journey record that rotated out of `.debug`, a served hash that is not the
// built one, or a "green" status with an empty notGreen list are all refutable on disk.

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const attestationPath = join(root, "docs", "release", version, "attestation.json");
const recordsDir = join(root, "test", "journeys", "records", "v2.3-plan05-live");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const read = () => JSON.parse(readFileSync(attestationPath, "utf8"));
const skip = () => (existsSync(attestationPath) ? false : `no docs/release/${version}/attestation.json — plan 11 writes it`);

const currentBuild = () => {
  const built = join(root, "dist", "index.js");
  if (!existsSync(built)) return null;
  const bytes = readFileSync(built);
  const manifestPath = join(root, "dist", "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  return { bundleSha256: sha256(bytes), bundleBytes: bytes.length, manifest };
};

test("the attestation records only the attested build; the current one is computed, never hand-kept", { skip: skip() }, () => {
  const attestation = read();
  assert.equal(attestation.kind, "acceptance-attestation");
  assert.equal(attestation.extension.version, version, "the attestation and package.json disagree on the version");
  assert.equal(attestation.build.current, undefined, "build.current is back: a hand-edited mirror of dist goes stale on every build");
  const current = currentBuild();
  if (!current?.manifest) return;
  assert.equal(current.manifest.bundle.sha256, current.bundleSha256, "dist/manifest.json does not describe dist/index.js");
});

test("drift from the attested build is declared by policy, never silent", { skip: skip() }, () => {
  const attestation = read();
  const attested = attestation.build.attested;
  assert.match(attested.bundle.sha256, /^[0-9a-f]{64}$/);
  assert.match(attested.source.sha256, /^[0-9a-f]{64}$/);
  assert.ok(attestation.build.driftPolicy?.length > 60, "no driftPolicy: nothing says what a build other than the attested one is covered by");
  const current = currentBuild();
  if (current && current.bundleSha256 !== attested.bundle.sha256) {
    console.log(`# current bundle ${current.bundleSha256.slice(0, 12)} is not the attested ${attested.bundle.sha256.slice(0, 12)}: the attestation's evidence does not describe it`);
  }
});

test("the served hash is the attested hash, not a copy of it", { skip: skip() }, () => {
  const attestation = read();
  assert.equal(attestation.served.matchesAttestedBuild, attestation.served.sha256 === attestation.build.attested.bundle.sha256, "matchesAttestedBuild disagrees with the two hashes beside it");
  assert.match(attestation.served.sha256, /^[0-9a-f]{64}$/, "no served hash: what the page ran is unknown, which is not an attestation");
});

// V22b: the catalog has J12, and a journey that never ran is accounted for by saying so, not by
// leaving it out — the audit found J12 missing while the note called the matrix green.
test("every journey J0 through J12 is accounted for, and one that never ran says so", { skip: skip() }, () => {
  const attestation = read();
  const journeys = attestation.journeys;
  const ids = Object.keys(journeys).filter((key) => /^J\d+$/.test(key));
  assert.deepEqual(ids, ["J0", "J1", "J2", "J3", "J4", "J5", "J6", "J7", "J8", "J9", "J10", "J11", "J12"], "a journey is missing from the attestation");
  for (const id of ids) {
    const runs = journeys[id].runs;
    if (typeof journeys[id].notRun === "string") {
      assert.ok(journeys[id].notRun.length > 20 && (runs ?? []).length === 0, `${id} is notRun but carries runs, or no reason`);
      assert.ok((attestation.notGreen ?? []).some((line) => line.includes(id)), `${id} never ran and notGreen does not name it`);
      continue;
    }
    assert.ok(Array.isArray(runs) && runs.length, `${id} claims no runs`);
    for (const run of runs) {
      assert.equal(typeof run.automated?.pass, "number", `${id} has a run with no automated tally`);
      assert.equal(run.firstAttemptRetried, 0, `${id} needed a retry — say which check and why, or the green means less than it says`);
    }
  }
});

test("every record it cites exists on disk", { skip: skip() }, () => {
  const journeys = read().journeys;
  const cited = Object.entries(journeys).filter(([key]) => /^J\d+$/.test(key)).flatMap(([, journey]) => journey.records ?? []);
  assert.ok(cited.length, "the attestation cites no records at all");
  const missing = cited.filter((name) => !existsSync(join(recordsDir, name)));
  assert.deepEqual(missing, [], `cited records that are not there (rotated out of .debug before being archived?): ${missing.join(", ")}`);
});

test("a PARTIAL attestation says what is not green, and a full one has nothing to say", { skip: skip() }, () => {
  const attestation = read();
  assert.ok(["ACCEPTED", "PARTIAL"].includes(attestation.status), `unknown status ${attestation.status}`);
  if (attestation.status === "PARTIAL") {
    assert.ok(Array.isArray(attestation.notGreen) && attestation.notGreen.length >= 3, "PARTIAL with an empty or token notGreen list is a green dressed up");
    assert.ok(attestation.statusNote?.length > 40, "PARTIAL must say in words what did not run");
  } else {
    assert.deepEqual(attestation.notGreen ?? [], [], "an ACCEPTED attestation cannot carry outstanding items");
  }
});

// V22b (process rule 12): "twice" means two recorded, consecutive, all-pass runs. The note said the
// matrix "ran green twice" while J0 ran once, J7 never went green and three journeys had one record.
const allPass = (run) => run.automated.fail === 0 && run.automated.blocked === 0;
const greenTwice = (journey) => (journey.runs ?? []).filter((run) => allPass(run) && run.recorded !== false).length >= 2;

test("a journey that never ran all-green is named in notGreen", { skip: skip() }, () => {
  const attestation = read();
  const neverGreen = Object.entries(attestation.journeys).filter(([key, journey]) => /^J\d+$/.test(key) && (journey.runs ?? []).length && !journey.runs.some(allPass)).map(([key]) => key);
  const unnamed = neverGreen.filter((id) => !(attestation.notGreen ?? []).some((line) => new RegExp(`\\b${id}\\b`).test(line)));
  assert.deepEqual(unnamed, [], "a journey that never went green is missing from notGreen");
});

test("the status note claims 'twice' only when every journey has two recorded all-pass runs", { skip: skip() }, () => {
  const attestation = read();
  const claimsTwice = /\b(green|ran) twice\b/i.test((attestation.statusNote ?? "").replace(/did NOT run green twice/gi, ""));
  if (!claimsTwice) return;
  const short = Object.entries(attestation.journeys).filter(([key, journey]) => /^J\d+$/.test(key) && !greenTwice(journey)).map(([key]) => key);
  assert.deepEqual(short, [], "the note says the matrix ran green twice, and these journeys did not");
});
