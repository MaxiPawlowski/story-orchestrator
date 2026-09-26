import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { exampleFiles, noticeIssues, renderNotices } from "./notices.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { bundledPackages, packageOf } = createRequire(import.meta.url)("./bundledPackages.cjs");
const statsPath = join(root, ".build", "packages-prod.json");
const noStats = !existsSync(statsPath) && "no .build/packages-prod.json: run npm run build first";
const dependencies = Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies ?? {});
const notices = () => readFileSync(join(root, "THIRD-PARTY-NOTICES.md"), "utf8");

test("LI: every bundled package has a notice with an allowed licence, every runtime dependency is bundled, every example has provenance", { skip: noStats }, () => {
  const packages = JSON.parse(readFileSync(statsPath, "utf8"));
  assert.ok(packages.some((pkg) => pkg.name === "react") && packages.some((pkg) => pkg.name === "style-loader") && packages.some((pkg) => pkg.name === "webpack"), "loader runtimes and webpack's own runtime are counted");
  assert.deepEqual(noticeIssues({ notices: notices(), packages, dependencies, examples: exampleFiles() }), []);
});

test("LI controls: a planted bundled package, an unused runtime dependency, a disallowed licence and an unrecorded example fail", () => {
  const packages = [{ name: "react", version: "19.1.1", license: "MIT" }];
  const text = renderNotices({ packages, licenceText: () => "MIT text", examples: ["examples/README.md"] });
  assert.deepEqual(noticeIssues({ notices: text, packages, dependencies: ["react"], examples: ["examples/README.md"] }), []);
  assert.deepEqual(noticeIssues({ notices: text, packages: [...packages, { name: "style-loader", version: "4.0.0", license: "MIT" }], dependencies: [], examples: [] }), ["style-loader@4.0.0 is bundled but has no notice row"]);
  assert.deepEqual(noticeIssues({ notices: text, packages, dependencies: ["react", "yaml"], examples: [] }), ["yaml is a declared runtime dependency the bundle does not contain"]);
  assert.deepEqual(noticeIssues({ notices: text, packages: [{ name: "react", version: "19.1.1", license: "GPL-2.0" }], dependencies: [], examples: [] }).at(-1), "react is GPL-2.0, not on the allowed list");
  assert.deepEqual(noticeIssues({ notices: text, packages, dependencies: [], examples: ["examples/new.png"] }), ["examples/new.png ships without a provenance entry"]);
});

test("LI: the package list is read from module resources, scoped names and loader requests included", () => {
  assert.deepEqual(packageOf("C:\\x\\node_modules\\@scope\\pkg\\dist\\a.js")?.name, "@scope/pkg");
  assert.deepEqual(packageOf("/x/node_modules/a/node_modules/b/index.js")?.name, "b");
  assert.equal(packageOf("C:/x/src/index.tsx"), null);
  const webpackDir = dirname(createRequire(import.meta.url).resolve("webpack/package.json"));
  const names = bundledPackages([join(root, "node_modules", "style-loader", "dist", "runtime", "injectStylesIntoStyleTag.js"), `${join(root, "node_modules", "css-loader", "dist", "cjs.js")}!${join(root, "src", "styles.css")}`], webpackDir).map((pkg) => pkg.name);
  assert.deepEqual(names, ["style-loader", "webpack"]);
});
