#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_OUT } from "./guide-site.mjs";
import { brokenSiteLinks, demoDirs, demoProblems, DENY_FILE, denyTerms, mediaProblems, overBudget, pageWeights, privacyHits, sitePages, sourceProblems, walkFiles } from "./site-extras.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const cardNames = (dir) => {
  const names = new Set();
  for (const file of walkFiles(dir).filter((path) => path.endsWith(".json"))) {
    let data;
    try { data = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    for (const card of [data, data?.data]) {
      if (card && typeof card.name === "string" && (typeof card.first_mes === "string" || typeof card.description === "string")) names.add(card.name.trim());
    }
  }
  return [...names].filter((name) => name.length >= 3).sort();
};

export function siteCheck(out = SITE_OUT, { env = process.env } = {}) {
  if (!existsSync(join(out, "index.html"))) return { problems: [`${out}: no built site (run npm run guide:site)`], deny: null };
  const deny = denyTerms({ env });
  const how = sitePages().filter((page) => page.audience === "how" && !page.id.endsWith("/README"));
  const problems = [
    ...brokenSiteLinks(out).map((line) => `link: ${line}`),
    ...overBudget(pageWeights(out)).map((line) => `size: ${line}`),
    ...privacyHits(out, deny).map((line) => `privacy: ${line}`),
    ...mediaProblems().map((line) => `media: ${line}`),
    ...demoProblems(demoDirs()).map((line) => `demo: ${line}`),
    ...sourceProblems(how).map((line) => `source: ${line}`),
  ];
  return { problems, deny: deny.source ? deny.terms.length : null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const from = args.indexOf("--deny-from");
  if (from >= 0) {
    const names = cardNames(resolve(args[from + 1] ?? ""));
    writeFileSync(DENY_FILE, `${names.join("\n")}\n`);
    console.log(`site check: wrote ${names.length} deny-list terms to ${relative(root, DENY_FILE)} (gitignored)`);
  }
  const site = args.indexOf("--site");
  const { problems, deny } = siteCheck(site >= 0 ? resolve(args[site + 1]) : SITE_OUT);
  console.log(`site check: deny list ${deny === null ? "absent (patterns only)" : `${deny} terms`}, ${problems.length} problem(s)`);
  for (const line of problems) console.log(`  ${line}`);
  process.exitCode = problems.length ? 1 : 0;
}
