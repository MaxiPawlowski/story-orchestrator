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
