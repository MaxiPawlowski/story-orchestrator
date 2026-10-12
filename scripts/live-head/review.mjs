import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { contained, root } from "./rig.mjs";

export async function reviewRig(projectArg, round, truthArg, manifestName = "live-head.json") {
  if (!/^[A-Za-z0-9_-]+$/.test(round ?? "")) throw new Error("Name the review round with letters, digits, underscore and hyphen.");
  const project = contained(projectArg), manifestFile = contained(join(project, manifestName)), output = contained(join(project, `review-${round}`));
  if (!existsSync(manifestFile)) throw new Error("Build and package the project first.");
  if (existsSync(output)) throw new Error("Review round exists; choose a new round name.");
  const bundle = join(root, ".build/live-head-review-page.js");
  await build({ entryPoints: [join(root, "scripts/live-head/review-page.mjs")], bundle: true, platform: "browser", format: "iife", outfile: bundle, logLevel: "warning" });
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
    const problems = [];
    page.on("pageerror", (error) => problems.push(error.message));
    await page.setContent("<!doctype html><body style='margin:0;background:#8c8c8c'></body>");
    await page.addScriptTag({ content: readFileSync(bundle, "utf8") });
    const { sheets, sample } = await page.evaluate((value) => window.renderReview(value.manifest, value.palette), { manifest: JSON.parse(readFileSync(manifestFile, "utf8")), palette: truthArg ? { iris: JSON.parse(readFileSync(contained(truthArg), "utf8")).iris } : null });
    if (problems.length) throw new Error(problems.join("\n"));
    mkdirSync(output, { recursive: true });
    for (const [name, url] of Object.entries(sheets)) writeFileSync(join(output, `${name}.png`), Buffer.from(url.split(",")[1], "base64"), { flag: "wx" });
    return { output, sheets: Object.keys(sheets), sample };
  } finally { await browser.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf("--manifest"), manifest = at < 0 ? undefined : args.splice(at, 2)[1];
  try { console.log(JSON.stringify(await reviewRig(args[0], args[1], args[2], manifest), null, 1)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
