import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { walk } from "./artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ALLOWED_LICENCES = ["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later"];

export const EXAMPLE_PROVENANCE = {
  "examples/README.md": { source: "written for this repository", licence: "AGPL-3.0" },
  "examples/sun-ruins/quest-for-the-sun-ruins.json": { source: "authored for this repository (commit ea0126e2, v2 plan 13)", licence: "AGPL-3.0" },
  "examples/sun-ruins/Xentar Checkpoints.json": { source: "authored for this repository (commit ea0126e2, v2 plan 13)", licence: "AGPL-3.0" },
  "examples/sun-ruins/Arin.png": { source: "character card added with the example story (commit ea0126e2); image origin not recorded", licence: "AGPL-3.0" },
  "examples/sun-ruins/DM Narrator.png": { source: "character card added with the example story (commit ea0126e2); image origin not recorded", licence: "AGPL-3.0" },
  "examples/sun-ruins/Luke.png": { source: "character card added with the example story (commit ea0126e2); image origin not recorded", licence: "AGPL-3.0" },
  "examples/sun-ruins/Ponticius.png": { source: "character card added with the example story (commit ea0126e2); image origin not recorded", licence: "AGPL-3.0" },
};

const row = (cells) => `| ${cells.join(" | ")} |`;

export function renderNotices({ packages, licenceText, examples }) {
  const texts = packages.map((pkg) => `### ${pkg.name} ${pkg.version} (${pkg.license})\n\n\`\`\`\n${licenceText(pkg.name).trim()}\n\`\`\``);
  return [
    "# Third-party notices",
    "",
    "Story Orchestrator is AGPL-3.0 (`LICENSE`). The shipped bundle (`dist/`) contains the packages below, read from the production",
    "webpack module list (`npm run build` writes `.build/packages.json`; `npm run notices` regenerates this file from it).",
    "",
    "## Bundled packages",
    "",
    row(["Package", "Version", "Licence"]),
    row(["---", "---", "---"]),
    ...packages.map((pkg) => row([`\`${pkg.name}\``, pkg.version, pkg.license])),
    "",
    "## Adapted code",
    "",
    "Parts of the memory tiers adapt [Smart-Memory](https://github.com/senjinthedragon/Smart-Memory) by Senjin the Dragon,",
    "AGPL-3.0. Its licence is kept with the reference copy in the source repository (`vendor/smart-memory/LICENSE`).",
    "",
    "## Example files",
    "",
    row(["File", "Provenance", "Licence"]),
    row(["---", "---", "---"]),
    ...examples.map((path) => row([`\`${path}\``, EXAMPLE_PROVENANCE[path]?.source ?? "UNRECORDED", EXAMPLE_PROVENANCE[path]?.licence ?? "UNRECORDED"])),
    "",
    "## Licence texts",
    "",
    ...texts.flatMap((text) => [text, ""]),
  ].join("\n");
}

export function noticeIssues({ notices, packages, dependencies, examples }) {
  const bundled = new Set(packages.map((pkg) => pkg.name));
  return [
    ...packages.filter((pkg) => !notices.includes(row([`\`${pkg.name}\``, pkg.version, pkg.license]))).map((pkg) => `${pkg.name}@${pkg.version} is bundled but has no notice row`),
    ...packages.filter((pkg) => !ALLOWED_LICENCES.includes(pkg.license)).map((pkg) => `${pkg.name} is ${pkg.license}, not on the allowed list`),
    ...dependencies.filter((name) => !bundled.has(name)).map((name) => `${name} is a declared runtime dependency the bundle does not contain`),
    ...examples.filter((path) => !EXAMPLE_PROVENANCE[path] || !notices.includes(`\`${path}\``)).map((path) => `${path} ships without a provenance entry`),
  ];
}

export const exampleFiles = (base = root) => (existsSync(join(base, "examples")) ? walk(join(base, "examples")).map((path) => `examples/${path}`).sort() : []);

const licenceText = (name) => {
  const dir = join(root, "node_modules", name);
  const file = readdirSync(dir).find((entry) => /^(licen[cs]e|copying)(\.|$)/i.test(entry));
  if (!file) throw new Error(`${name} ships no licence file`);
  return readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const statsPath = join(root, ".build", "packages.json");
  if (!existsSync(statsPath)) throw new Error(".build/packages.json is missing: run npm run build first");
  const packages = JSON.parse(readFileSync(statsPath, "utf8"));
  writeFileSync(join(root, "THIRD-PARTY-NOTICES.md"), renderNotices({ packages, licenceText, examples: exampleFiles() }).replace(/\n/g, "\r\n"));
  console.log(`THIRD-PARTY-NOTICES.md: ${packages.length} bundled packages, ${exampleFiles().length} example files`);
}
