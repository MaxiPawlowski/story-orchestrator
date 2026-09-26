import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAVOURS, fileListIssues, flavourIssues } from "./buildChecks.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

export function serveDev({ from = join(root, FLAVOURS.dev), to = join(root, FLAVOURS.prod) } = {}) {
  const manifestPath = join(from, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} is missing: run npm run build:dev first`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const issues = [
    ...flavourIssues(manifest, "dev"),
    ...fileListIssues(readdirSync(from).filter((name) => name !== "manifest.json"), manifest),
    ...(manifest.files ?? []).filter((file) => existsSync(join(from, file.path)) && sha256(join(from, file.path)) !== file.sha256).map((file) => `${file.path} does not match its manifest sha256`),
  ];
  if (issues.length) throw new Error(`refusing to serve ${from}: ${issues.join("; ")}`);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const name of [...manifest.files.map((file) => file.path), "manifest.json"]) copyFileSync(join(from, name), join(to, name));
  const bundleSha256 = sha256(join(to, "index.js"));
  if (bundleSha256 !== manifest.bundle.sha256) throw new Error(`the served index.js (${bundleSha256.slice(0, 12)}) is not the dev manifest's bundle`);
  return { bundleSha256, files: manifest.files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flavor = process.argv[2];
  if (flavor !== "dev") {
    console.error("usage: node scripts/release/serveFlavour.mjs dev   (prod is served by npm run build, which writes dist/ itself)");
    process.exit(1);
  }
  const out = serveDev();
  console.log(`dist/ now serves the dev build (bundle ${out.bundleSha256.slice(0, 12)}, ${out.files} files); run node scripts/debug/st-session.mts reload, and npm run build before test:release`);
}
