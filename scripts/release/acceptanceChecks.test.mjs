import { strict as assert } from "node:assert";
import { test } from "node:test";
import { acceptanceMode, candidateProblems, driftProblems, missingAttestationProblems } from "./acceptanceChecks.mjs";

const BUNDLE = "a".repeat(64);
const OTHER = "b".repeat(64);
const SOURCE = "c".repeat(64);
const CANDIDATE = "1".repeat(40);
const LATER = "2".repeat(40);

const attestation = (over = {}) => ({
  candidate: { commit: CANDIDATE },
  build: { attested: { bundle: { sha256: BUNDLE }, source: { sha256: SOURCE } } },
  served: { sha256: BUNDLE },
  ...over,
});
const manifest = (over = {}) => ({ extension: { revision: { commit: CANDIDATE, dirty: true } }, bundle: { sha256: BUNDLE }, source: { sha256: SOURCE }, ...over });
const git = (ancestor = true, changed = []) => ({ isAncestor: () => ancestor, changedSources: () => changed });

test("acceptance mode is the explicit SO_ACCEPTANCE=1 (or npm --acceptance), never implied", () => {
  assert.equal(acceptanceMode({ SO_ACCEPTANCE: "1" }), true);
  assert.equal(acceptanceMode({ npm_config_acceptance: "true" }), true);
  assert.equal(acceptanceMode({}), false);
  assert.equal(acceptanceMode({ SO_ACCEPTANCE: "0", SO_RELEASE: "1" }), false);
});

test("a missing attestation fails only in acceptance mode", () => {
  assert.deepEqual(missingAttestationProblems({ exists: false, version: "2.7.0", acceptance: false }), []);
  assert.deepEqual(missingAttestationProblems({ exists: true, version: "2.7.0", acceptance: true }), []);
  assert.match(missingAttestationProblems({ exists: false, version: "2.7.0", acceptance: true })[0], /docs\/release\/2\.7\.0\/attestation\.json is missing/);
});

test("drift from the attested bundle fails; the attested bundle itself passes (planted drift control)", () => {
  assert.deepEqual(driftProblems({ attestedBundle: BUNDLE, current: { bundleSha256: BUNDLE }, acceptance: true }), []);
  assert.match(driftProblems({ attestedBundle: BUNDLE, current: { bundleSha256: OTHER }, acceptance: false })[0], /is not the attested/);
  assert.deepEqual(driftProblems({ attestedBundle: BUNDLE, current: null, acceptance: false }), [], "no build outside acceptance: nothing to compare");
  assert.match(driftProblems({ attestedBundle: BUNDLE, current: null, acceptance: true })[0], /no dist\/index\.js/);
});

test("the candidate check passes on the candidate's own build (positive control)", () => {
  assert.deepEqual(candidateProblems({ attestation: attestation(), manifest: manifest(), currentBundle: BUNDLE, git: git() }), []);
  assert.deepEqual(candidateProblems({ attestation: attestation(), manifest: manifest({ extension: { revision: { commit: LATER } } }), currentBundle: BUNDLE, git: git(true, []) }), [], "a docs-only commit after the candidate builds the same sources");
});

test("the candidate check names each planted defect", () => {
  const problems = (over, mf = manifest(), current = BUNDLE, repo = git()) => candidateProblems({ attestation: attestation(over), manifest: mf, currentBundle: current, git: repo });
  assert.match(problems({ candidate: { commit: "4ebe1db" } }).join("\n"), /not a full commit hash/);
  assert.match(problems({ served: { sha256: OTHER } }).join("\n"), /served\.sha256 .* is not the attested bundle/);
  assert.match(problems({}, null).join("\n"), /no dist\/manifest\.json/);
  assert.match(problems({}, manifest({ bundle: { sha256: OTHER } }), OTHER).join("\n"), /built bundle .* is not the attested/);
  assert.match(problems({}, manifest(), OTHER).join("\n"), /does not describe dist\/index\.js/);
  assert.match(problems({}, manifest({ source: { sha256: OTHER } })).join("\n"), /built source .* is not the attested source/);
  const later = manifest({ extension: { revision: { commit: LATER } } });
  assert.match(problems({}, later, BUNDLE, git(false)).join("\n"), /does not descend from the candidate/);
  assert.match(problems({}, later, BUNDLE, git(true, ["src/index.tsx"])).join("\n"), /changes the candidate's sources: src\/index\.tsx/);
  assert.match(problems({}, manifest({ extension: { revision: null } })).join("\n"), /names no build commit/);
});
