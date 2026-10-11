import { readFileSync, writeFileSync, existsSync, realpathSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, relative, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export function contained(path) {
  const absolute = resolve(root, path);
  let parent = absolute;
  while (!existsSync(parent)) parent = dirname(parent);
  const checked = resolve(realpathSync(parent), relative(parent, absolute));
  const rel = relative(realpathSync(root), checked);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Project paths must stay inside this worktree.");
  return absolute;
}

async function contract() {
  const outfile = join(root, ".build/live-head-contract.mjs");
  await build({ entryPoints: [join(root, "src/sprites/liveHead/manifest.ts")], bundle: true, platform: "node", format: "esm", outfile, logLevel: "warning" });
  return import(pathToFileURL(outfile).href);
}

export async function packageHead(project, identity) {
  const directory = contained(project), source = contained(join(directory, "source.png")), output = contained(join(directory, "live-head.json"));
  if (existsSync(output)) throw new Error("Rig package exists; choose a new project.");
  const rig = JSON.parse(readFileSync(contained(join(directory, "rig.json")), "utf8"));
  const meta = JSON.parse(readFileSync(contained(join(directory, "built/layers.json")), "utf8"));
  const { loadHeadManifest, HEAD_LAYERS } = await contract();
  const manifest = loadHeadManifest({ version: 1, ...identity, artHash: createHash("sha256").update(readFileSync(source)).digest("hex"), rig,
    layers: HEAD_LAYERS.map((name) => ({ name, rect: name === "base" ? [0, 0, rig.image.width, rig.image.height] : meta.layers[name],
      image: `data:image/png;base64,${readFileSync(contained(join(directory, `built/${name}.png`))).toString("base64")}` })) });
  const text = JSON.stringify(manifest);
  if (encodeURIComponent(text).length > 23_999_970) throw new Error("Rig package exceeds the import limit.");
  writeFileSync(output, text + "\n", { flag: "wx" });
  return output;
}

export async function runRig(argv, launch = spawnSync) {
  const [command, projectArg, ...args] = argv;
  const options = Object.fromEntries(Array.from({ length: Math.ceil(args.length / 2) }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  if (!["build", "package", "grid", "overlay", "calibration"].includes(command) || !projectArg)
    throw new Error("Usage: node scripts/live-head/rig.mjs build|package|grid|overlay|calibration <project> [--python <binary>] [--member <id> --look <set> --source-url </characters/.../neutral.png>] [--region x0,y0,x1,y1 --step 5]");
  if (args.length % 2 || Object.keys(options).some((key) => !["--python", "--member", "--look", "--source-url", "--region", "--step"].includes(key))) throw new Error("Unknown or incomplete rig option.");
  const project = contained(projectArg), python = options["--python"] ?? "python";
  if (!existsSync(project)) throw new Error("Create a local project with source.png and rig.draft.json first.");
  const work = contained(join(project, "work"));
  const invoke = (name, parameters) => {
    const result = launch(python, [join(root, "scripts/live-head/vendor", name), ...parameters], { cwd: root, stdio: "inherit", shell: false });
    if (result.error || result.status !== 0) throw new Error("CPU rig step failed. Use Python 3.12+ with installed NumPy, Pillow and OpenCV; no dependencies are installed by this command.");
  };
  if (command === "calibration") {
    const directory = contained(join(work, "calibration"));
    invoke("vision-check.py", ["make", directory]);
    return directory;
  }
  contained(join(project, "source.png"));
  if (command === "grid" || command === "overlay") {
    const output = contained(join(work, `${command}.png`));
    if (existsSync(output)) throw new Error("Review image exists; choose a new project for another run.");
    mkdirSync(work, { recursive: true });
    invoke(`${command}.py`, [project, "--out", output, ...(command === "grid" ? ["--step", options["--step"] ?? "50", ...(options["--region"] ? ["--region", options["--region"]] : [])] : ["--rig", "rig.draft.json"])]);
    return output;
  }
  const identity = { member: options["--member"], look: options["--look"], source: options["--source-url"] };
  if (!identity.member || !identity.look || !/^\/(?!\/)[^\\\x00-\x1f\x7f]+$/.test(identity.source ?? "")) throw new Error("Supply member id, look/set and a local source sprite URL.");
  if (command === "build") {
    const draft = contained(join(project, "rig.draft.json"));
    if (existsSync(contained(join(project, "built"))) || existsSync(contained(join(project, "rig.json")))) throw new Error("Built rig exists; use a new project.");
    const validatorFile = join(root, ".build/live-head-validator.mjs");
    await build({ entryPoints: [join(root, "src/sprites/liveHead/validate.ts")], bundle: true, platform: "node", format: "esm", outfile: validatorFile, logLevel: "warning" });
    const { validateRig } = await import(pathToFileURL(validatorFile).href);
    const rig = JSON.parse(readFileSync(draft, "utf8")), issues = validateRig(rig, { draft: true });
    if (issues.length || rig.hand || rig.accessories?.length || rig.image.width > 2048 || rig.image.height > 2048) throw new Error(issues.join("\n") || "Unsupported close-shot rig.");
    invoke("build-layers.py", [project, "--rig", "rig.draft.json"]);
  }
  return packageHead(project, identity);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(await runRig(process.argv.slice(2))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
