export const ACCEPTANCE_ENV = "SO_ACCEPTANCE";

export const SOURCE_PATHS = ["src", "webpack.config.js", "postcss.config.js", "tsconfig.json", "package.json", "manifest.json"];

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

export const acceptanceMode = (env) => env[ACCEPTANCE_ENV] === "1" || env.npm_config_acceptance === "true";

export const missingAttestationProblems = ({ exists, version, acceptance }) =>
  acceptance && !exists ? [`acceptance mode (${ACCEPTANCE_ENV}=1) and docs/release/${version}/attestation.json is missing: the close-out writes it before this check runs`] : [];

export const driftProblems = ({ attestedBundle, current, acceptance }) => {
  if (!current) return acceptance ? ["no dist/index.js: acceptance mode checks the attested build, so build the candidate first (npm run build)"] : [];
  if (current.bundleSha256 === attestedBundle) return [];
  return [`current bundle ${current.bundleSha256.slice(0, 12)} is not the attested ${String(attestedBundle).slice(0, 12)}: the attestation's evidence does not describe it`];
};

export const candidateProblems = ({ attestation, manifest, currentBundle, git }) => {
  const problems = [];
  const commit = attestation?.candidate?.commit;
  const attested = attestation?.build?.attested ?? {};
  const served = attestation?.served ?? {};
  if (!COMMIT.test(commit ?? "")) problems.push(`candidate.commit ${JSON.stringify(commit ?? null)} is not a full commit hash`);
  if (!SHA256.test(attested.bundle?.sha256 ?? "")) problems.push("build.attested.bundle.sha256 is not a sha256");
  if (served.sha256 !== attested.bundle?.sha256) problems.push(`served.sha256 ${String(served.sha256).slice(0, 12)} is not the attested bundle ${String(attested.bundle?.sha256).slice(0, 12)}`);
  if (!manifest) return [...problems, "no dist/manifest.json: the candidate's build cannot be checked"];
  if (manifest.flavor !== "prod") problems.push(`dist/manifest.json is the ${manifest.flavor} build; the attestation describes the prod build`);
  if (currentBundle !== undefined && manifest.bundle?.sha256 !== currentBundle) problems.push("dist/manifest.json does not describe dist/index.js");
  if (manifest.bundle?.sha256 !== attested.bundle?.sha256) problems.push(`built bundle ${String(manifest.bundle?.sha256).slice(0, 12)} is not the attested ${String(attested.bundle?.sha256).slice(0, 12)}`);
  if (manifest.source?.sha256 !== attested.source?.sha256) problems.push(`built source ${String(manifest.source?.sha256).slice(0, 12)} is not the attested source ${String(attested.source?.sha256).slice(0, 12)}`);
  const built = manifest.extension?.revision?.commit;
  if (!COMMIT.test(commit ?? "") || built === commit) return problems;
  if (!COMMIT.test(built ?? "")) return [...problems, "dist/manifest.json names no build commit"];
  if (!git.isAncestor(commit, built)) return [...problems, `the build commit ${built.slice(0, 12)} does not descend from the candidate ${commit.slice(0, 12)}`];
  const changed = git.changedSources(commit, built);
  return changed.length ? [...problems, `the build commit ${built.slice(0, 12)} changes the candidate's sources: ${changed.join(", ")}`] : problems;
};
