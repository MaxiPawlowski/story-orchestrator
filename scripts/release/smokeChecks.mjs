export const EXTENSION_BASE = "/scripts/extensions/third-party/story-orchestrator";
export const GENERATE_INTERCEPTOR = "talkControlInterceptor";

export const globalIssues = (keys, allowlist) => [
  ...keys.filter((key) => key.startsWith("storyOrchestrator") && !allowlist.includes(key)).map((key) => `the artifact exposes ${key}, which is not on the prod allowlist`),
  ...(keys.includes(GENERATE_INTERCEPTOR) ? [] : [`${GENERATE_INTERCEPTOR} is missing: manifest.json generate_interceptor names it`]),
];

export const chunkRequestIssues = (responses) => {
  const chunks = responses.filter((response) => new RegExp(`${EXTENSION_BASE}/dist/\\d+\\.index\\.js`).test(response.url));
  return [
    ...(chunks.length ? [] : ["no lazy chunk was requested: the Studio never loaded its chunk, so the check proves nothing"]),
    ...chunks.filter((response) => response.status !== 200).map((response) => `${response.url} answered ${response.status}`),
  ];
};

export const consoleIssues = (messages) => messages
  .filter((message) => /ChunkLoadError|Loading chunk \d+ failed|Failed to load cytoscape-dagre/i.test(message))
  .map((message) => `console: ${message.slice(0, 200)}`);

export const bundleIssues = ({ served, built, released }) => [
  ...(served && built && served === built ? [] : [`the served dist/index.js (${String(served).slice(0, 12)}) is not dist/manifest.json's bundle (${String(built).slice(0, 12)})`]),
  ...(released === undefined || released === built ? [] : [`dist/manifest.json's bundle (${String(built).slice(0, 12)}) is not release-manifest.json's (${String(released).slice(0, 12)})`]),
];
