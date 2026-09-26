export const FLAVOURS = { prod: "dist", dev: "dist-dev" };

export const flavourIssues = (manifest, expected) =>
  manifest?.flavor === expected ? [] : [`manifest flavor is ${manifest?.flavor === undefined ? "undefined" : JSON.stringify(manifest.flavor)}, expected ${JSON.stringify(expected)}`];

export const fileListIssues = (listing, manifest) => {
  const named = new Set((manifest?.files ?? []).map((file) => file.path));
  const present = new Set(listing);
  return [
    ...[...present].filter((name) => !named.has(name)).map((name) => `${name} is in the output dir but not in the manifest`),
    ...[...named].filter((name) => !present.has(name)).map((name) => `${name} is in the manifest but not in the output dir`),
  ];
};

const ABSOLUTE = /^[A-Za-z]:[\\/]|^\//;

export const absolutePathValues = (value, at = []) => {
  if (typeof value === "string") return ABSOLUTE.test(value) ? [at.join(".")] : [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => absolutePathValues(entry, [...at, String(index)]));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, entry]) => absolutePathValues(entry, [...at, key]));
  return [];
};

export const livereloadHits = (text) => (text.match(/livereload/gi) ?? []).length;

export const PROD_GLOBAL_ALLOWLIST = [];

export const surfaceNames = (text) => [...new Set(text.match(/storyOrchestrator[A-Z]\w*/g) ?? [])].sort();

export const changelogTopVersion = (text) => /^## +v?(\S+)/m.exec(text)?.[1] ?? null;

export const versionIssues = ({ pkg, loader, build, changelog }) => [
  ...(loader === pkg ? [] : [`manifest.json version ${loader} != package.json ${pkg}`]),
  ...(build === undefined || build === pkg ? [] : [`dist/manifest.json extension.version ${build} != package.json ${pkg}`]),
  ...(changelog === pkg ? [] : [`CHANGELOG.md top heading ${changelog} != package.json ${pkg}`]),
];

export const releaseMode = (env, tags) => env.npm_config_release === "true" || env.SO_RELEASE === "1" || tags.some((tag) => /^v\d/.test(tag));

export const tagIssues = (tags, version) => {
  if (tags.includes(`v${version}`)) return [];
  const carried = tags.filter((tag) => /^v\d/.test(tag));
  return [`release mode but HEAD carries no tag v${version}${carried.length ? ` (it carries ${carried.join(", ")})` : ""}`];
};

export const BUNDLE_BUDGET_BYTES = 1250000;

export const budgetIssues = (manifest, budget = BUNDLE_BUDGET_BYTES) => {
  const bytes = manifest?.bundle?.bytes;
  if (typeof bytes !== "number") return ["dist/manifest.json names no bundle size"];
  return bytes <= budget ? [] : [`dist/index.js is ${bytes} bytes, over the ${budget} byte budget`];
};
