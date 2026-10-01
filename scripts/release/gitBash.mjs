import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const fromGit = () => {
  try {
    const exec = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
    let dir = exec;
    for (let up = 0; up < 5 && dir !== dirname(dir); up += 1) {
      dir = dirname(dir);
      const candidate = join(dir, "bin", "bash.exe");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    return null;
  }
  return null;
};

export function gitBashCandidates(env = process.env, platform = process.platform) {
  if (platform !== "win32") return [env.GIT_BASH, "bash"].filter(Boolean);
  const programFiles = [env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramW6432].filter(Boolean);
  return [env.GIT_BASH, fromGit(), ...programFiles.map((dir) => join(dir, "Git", "bin", "bash.exe"))].filter(Boolean);
}

export function resolveGitBash(env = process.env, platform = process.platform) {
  for (const candidate of gitBashCandidates(env, platform)) {
    if (platform === "win32" && !existsSync(candidate)) continue;
    if (spawnSync(candidate, ["-c", "true"], { stdio: "ignore" }).status === 0) return candidate;
  }
  return null;
}
