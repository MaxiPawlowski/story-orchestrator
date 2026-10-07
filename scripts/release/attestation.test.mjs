// v2.3 plan 11. Plan 08's manifest is checked against the bytes it describes; the attestation is the
// second file of the pair and needs the same treatment, because everything it claims is a claim about
// files. A citation to a journey record that rotated out of `.debug`, a served hash that is not the
// built one, or a "green" status with an empty notGreen list are all refutable on disk.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { acceptanceMode, ACCEPTANCE_ENV, candidateProblems, driftProblems, missingAttestationProblems, SOURCE_PATHS } from "./acceptanceChecks.mjs";
import { attestedJourneyIds, catalogProblems, citedRecords, journeyCatalog, recordsRootOf } from "./attestationChecks.mjs";
import { citedPathProblem, engineHistoryCitation, greenTwiceEverywhere, journeyVerdicts, resolveCited, runLines, statusProblems } from "./attestationRules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const attestationPath = join(root, "docs", "release", version, "attestation.json");
const journeysDir = join(root, "test", "journeys");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const acceptance = acceptanceMode(process.env);
const read = () => JSON.parse(readFileSync(attestationPath, "utf8"));
const skip = () => (existsSync(attestationPath) ? false : `no docs/release/${version}/attestation.json — the acceptance plan writes it`);
const recordsDir = () => recordsRootOf(read(), root);
const attestedBuildOf = (attestation) => attestation.build?.attested?.bundle?.sha256 ?? null;
const loadCited = (dir) => (cited) => {
  const path = resolveCited(dir, cited);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};
const verdictsOf = (attestation) =>
  journeyVerdicts(attestation, loadCited(recordsDir()), {
    attestedBuild: attestedBuildOf(attestation),
    humanScores: posix.join(attestation.evidence.journeys, "human", "scores.json"),
  });

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
  if (!current?.manifest) return assert.ok(!acceptance, "acceptance mode and no dist/manifest.json: build the candidate first");
  assert.equal(current.manifest.bundle.sha256, current.bundleSha256, "dist/manifest.json does not describe dist/index.js");
});

test("drift from the attested build is declared by policy, never silent", { skip: skip() }, () => {
  const attestation = read();
  const attested = attestation.build.attested;
  assert.match(attested.bundle.sha256, /^[0-9a-f]{64}$/);
  assert.match(attested.source.sha256, /^[0-9a-f]{64}$/);
  assert.ok(attestation.build.driftPolicy?.length > 60, "no driftPolicy: nothing says what a build other than the attested one is covered by");
  assert.deepEqual(driftProblems({ attestedBundle: attested.bundle.sha256, current: currentBuild(), acceptance }), []);
});

test(`acceptance mode (${ACCEPTANCE_ENV}=1) requires the attestation; ordinary gates skip its checks until the close-out writes it`, () => {
  assert.deepEqual(missingAttestationProblems({ exists: existsSync(attestationPath), version, acceptance }), []);
});

const git = {
  isAncestor: (ancestor, descendant) => {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  },
  changedSources: (from, to) => execFileSync("git", ["diff", "--name-only", from, to, "--", ...SOURCE_PATHS], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean),
};

test("the candidate commit built the bundle the attestation names, and the served hash is that bundle", { skip: skip() }, () => {
  const current = currentBuild();
  assert.deepEqual(candidateProblems({ attestation: read(), manifest: current?.manifest ?? null, currentBundle: current?.bundleSha256, git }), []);
});

test("the served hash is the attested hash, not a copy of it", { skip: skip() }, () => {
  const attestation = read();
  assert.equal(attestation.served.matchesAttestedBuild, attestation.served.sha256 === attestation.build.attested.bundle.sha256, "matchesAttestedBuild disagrees with the two hashes beside it");
  assert.match(attestation.served.sha256, /^[0-9a-f]{64}$/, "no served hash: what the page ran is unknown, which is not an attestation");
});

// V22b: a journey that never ran is accounted for by saying so, not by leaving it out — the audit found
// J12 missing while the note called the matrix green. v2.4 plan 02 (X11): the set is the journey
// catalog on disk, not a literal J0..J12 that a new journey would silently fall outside of.
test("every journey in test/journeys is accounted for, and one that never ran says so", { skip: skip() }, () => {
  const attestation = read();
  const journeys = attestation.journeys;
  const ids = attestedJourneyIds(attestation);
  assert.deepEqual(catalogProblems(ids, journeyCatalog(journeysDir)), [], "the attestation and the journey catalog disagree");
  for (const id of ids) {
    const runs = journeys[id].runs;
    if (typeof journeys[id].notRun === "string") {
      assert.ok(journeys[id].notRun.length > 20 && (runs ?? []).length === 0, `${id} is notRun but carries runs, or no reason`);
      assert.ok((attestation.notGreen ?? []).some((line) => line.includes(id)), `${id} never ran and notGreen does not name it`);
      continue;
    }
    assert.ok(Array.isArray(runs) && runs.length, `${id} claims no runs`);
    for (const run of runs) assert.equal(typeof run.record, "string", `${id} has a run that cites no record: a tally typed into the attestation is not evidence`);
  }
});

test("every run of every journey is reported, not only the first two", { skip: skip() }, () => {
  const attestation = read();
  const lines = runLines(attestation, verdictsOf(attestation));
  const expected = attestedJourneyIds(attestation).reduce((sum, id) => sum + (typeof attestation.journeys[id].notRun === "string" ? 1 : (attestation.journeys[id].runs ?? []).length + 1), 0);
  assert.equal(lines.length, expected);
  for (const line of lines) console.log(line);
});

test("the journey set is derived: a catalog journey the attestation omits is named, and so is one with no file", () => {
  const dir = mkdtempSync(join(tmpdir(), "so-attest-"));
  try {
    for (const id of ["J0", "J2", "J13"]) writeFileSync(join(dir, `${id.toLowerCase()}.journey.json`), JSON.stringify({ id }));
    writeFileSync(join(dir, "notes.json"), "{}");
    assert.deepEqual(journeyCatalog(dir), ["J0", "J2", "J13"]);
    assert.deepEqual(catalogProblems(["J0", "J1", "J2"], journeyCatalog(dir)), ["J13 is in the journey catalog and not in the attestation", "J1 is attested and has no journey file"]);
    writeFileSync(join(dir, "bad.journey.json"), JSON.stringify({ id: "first-contact" }));
    assert.throws(() => journeyCatalog(dir), /bad\.journey\.json has no journey id/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the records root is the attestation's own evidence.journeys, and one that escapes the repo is refused", () => {
  assert.equal(recordsRootOf({ evidence: { journeys: "test/journeys/records/v2.4-plan09/" } }, root), join(root, "test", "journeys", "records", "v2.4-plan09"));
  assert.throws(() => recordsRootOf({ evidence: {} }, root), /names no evidence\.journeys/);
  assert.throws(() => recordsRootOf({ evidence: { journeys: "../../elsewhere" } }, root), /outside the repo/);
  assert.deepEqual(citedRecords({ journeys: { J1: { records: ["a.json"], runs: [{ record: "J1/run1/record.json", header: "J1/run1/header-start.json" }, { automated: {} }] }, rule: { records: ["x"] }, J2: {} } }), ["a.json", "J1/run1/record.json", "J1/run1/header-start.json"]);
});

test("every path it cites stays under the records root and exists on disk", { skip: skip() }, () => {
  const cited = citedRecords(read());
  assert.ok(cited.length, "the attestation cites no records at all");
  const escaping = cited.map(citedPathProblem).filter(Boolean);
  assert.deepEqual(escaping, [], "cited paths outside the records root");
  const dir = recordsDir();
  const missing = cited.filter((name) => !existsSync(resolveCited(dir, name)));
  assert.deepEqual(missing, [], `cited records that are not there (rotated out of .debug before being archived?): ${missing.join(", ")}`);
});

test("every engine-history dump a cited run names is on disk under the records root (H-k)", { skip: skip() }, () => {
  const attestation = read();
  const dir = recordsDir();
  const load = loadCited(dir);
  const missing = attestedJourneyIds(attestation).flatMap((id) =>
    (attestation.journeys[id].runs ?? [])
      .filter((run) => typeof run?.record === "string" && !citedPathProblem(run.record))
      .map((run) => engineHistoryCitation(run, load(run.record)))
      .filter((cited) => cited && (citedPathProblem(cited) || !existsSync(resolveCited(dir, cited)))),
  );
  assert.deepEqual(missing, [], `engine-history dumps a cited record names and the records root does not hold: ${missing.join(", ")}`);
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

// V22b (process rule 12) + v2.4 plan 09 §Matrix: "twice" is two CONSECUTIVE green runs on an unchanged
// build and fixture, green is --strict with a clean cleanup, and a partial run never counts. The rules
// are attestationRules.mjs, unit-tested (never skipped) in attestationRules.test.mjs.
test("every journey is green twice on the attested build, or the attestation is PARTIAL and notGreen names it", { skip: skip() }, () => {
  const attestation = read();
  assert.deepEqual(statusProblems(attestation, verdictsOf(attestation), { attestedBuild: attestedBuildOf(attestation) }), []);
});

test("the status note claims 'twice' only when every journey is green twice", { skip: skip() }, () => {
  const attestation = read();
  const claimsTwice = /\b(green|ran) twice\b/i.test((attestation.statusNote ?? "").replace(/did NOT run green twice/gi, ""));
  if (!claimsTwice) return;
  const verdicts = verdictsOf(attestation);
  const short = Object.entries(verdicts).filter(([, verdict]) => !verdict.twice).map(([id]) => id);
  assert.ok(greenTwiceEverywhere(verdicts), `the note says the matrix ran green twice, and these journeys did not: ${short.join(", ")}`);
});

// V20c (T4): an `--only` run writes `partial: true` into its record, and nothing used to read it — a
// subset run could be cited here as a journey's gate. Every cited journey record must be a full run.
test("no cited journey record is a partial (--only) run", { skip: skip() }, () => {
  const cited = citedRecords(read());
  const dir = recordsDir();
  const partial = cited.filter((name) => name.endsWith(".json") && !citedPathProblem(name) && existsSync(resolveCited(dir, name))).filter((name) => {
    const record = JSON.parse(readFileSync(resolveCited(dir, name), "utf8"));
    return Array.isArray(record.results) && record.partial === true;
  });
  assert.deepEqual(partial, [], `cited records from --only runs, which cannot stand for a gate: ${partial.join(", ")}`);
});
