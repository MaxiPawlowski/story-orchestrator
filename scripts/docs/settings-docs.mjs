#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REFERENCE_OUT = join(root, "docs", "guide", "setup", "settings-reference.md");
export const README = join(root, "README.md");

export async function loadSettingsDocs() {
  const dir = mkdtempSync(join(tmpdir(), "so-settings-docs-"));
  const outfile = join(dir, "settingsReference.mjs");
  try {
    await build({
      entryPoints: [join(root, "src", "features", "settingsReference.ts")],
      bundle: true, platform: "node", format: "esm", outfile, logLevel: "warning",
      tsconfig: join(root, "tsconfig.json"), define: { __SO_DEV__: "true" },
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const docs = await loadSettingsDocs();
  writeFileSync(REFERENCE_OUT, docs.renderSettingsReference());
  writeFileSync(README, docs.spliceFeatureTable(readFileSync(README, "utf8")));
  console.log(`settings docs: ${relative(root, REFERENCE_OUT)}, README feature table`);
}
