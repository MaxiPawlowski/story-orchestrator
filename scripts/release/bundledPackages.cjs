const fs = require("fs");
const path = require("path");

const packageOf = (resource) => {
  const parts = resource.split(/[\\/]/);
  const at = parts.lastIndexOf("node_modules");
  if (at < 0) return null;
  const scoped = parts[at + 1]?.startsWith("@");
  const name = scoped ? `${parts[at + 1]}/${parts[at + 2]}` : parts[at + 1];
  return name ? { name, dir: parts.slice(0, at + (scoped ? 3 : 2)).join(path.sep) } : null;
};

const describe = ({ name, dir }) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const license = typeof manifest.license === "string" ? manifest.license : manifest.license?.type ?? null;
  return { name, version: manifest.version ?? null, license };
};

const bundledPackages = (resources, webpackDir) => {
  const found = new Map();
  for (const resource of resources) {
    const owner = packageOf(resource.split("!").pop().split("?")[0]);
    if (owner && !found.has(owner.name)) found.set(owner.name, owner);
  }
  found.set("webpack", { name: "webpack", dir: webpackDir });
  return [...found.values()].map(describe).sort((a, b) => a.name.localeCompare(b.name));
};

class BundledPackagesPlugin {
  constructor({ out, webpackDir }) {
    this.out = out;
    this.webpackDir = webpackDir;
  }

  apply(compiler) {
    compiler.hooks.done.tap("BundledPackagesPlugin", (stats) => {
      const resources = new Set();
      const visit = (module) => {
        if (module.resource) resources.add(module.resource);
        for (const inner of module.modules ?? []) visit(inner);
      };
      for (const module of stats.compilation.modules) visit(module);
      fs.mkdirSync(path.dirname(this.out), { recursive: true });
      fs.writeFileSync(this.out, `${JSON.stringify(bundledPackages([...resources], this.webpackDir), null, 2)}\n`);
    });
  }
}

module.exports = { BundledPackagesPlugin, bundledPackages, packageOf };
