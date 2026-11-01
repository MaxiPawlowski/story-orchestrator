import type * as fs from "node:fs";
import type * as fsp from "node:fs/promises";

export declare class LaneSafetyError extends Error {}
export interface LaneSafetyContext { lanesRoot: string; lanesReal: string; protected: string[]; stRoots: string[] }
export interface GuardedFs {
  check(path: string): void;
  writeFile: typeof fsp.writeFile;
  appendFile: typeof fsp.appendFile;
  mkdir: typeof fsp.mkdir;
  rm: typeof fsp.rm;
  cp: typeof fsp.cp;
  copyFile: typeof fsp.copyFile;
  rename: typeof fsp.rename;
  open: typeof fsp.open;
  writeFileSync: typeof fs.writeFileSync;
  appendFileSync: typeof fs.appendFileSync;
  mkdirSync: typeof fs.mkdirSync;
  rmSync: typeof fs.rmSync;
  cpSync: typeof fs.cpSync;
  copyFileSync: typeof fs.copyFileSync;
  renameSync: typeof fs.renameSync;
  rmdirSync: typeof fs.rmdirSync;
  openSync: typeof fs.openSync;
  createWriteStream: typeof fs.createWriteStream;
}
export declare function isInside(child: string, parent: string): boolean;
export declare function realPathDeep(path: string): string;
export declare function ownerStRoot(env?: NodeJS.ProcessEnv, repoRoot?: string): string | null;
export declare function protectedRoots(env?: NodeJS.ProcessEnv, repoRoot?: string): string[];
export declare function laneSafetyContext(env?: NodeJS.ProcessEnv, repoRoot?: string): LaneSafetyContext;
export declare function protectedIssue(path: string, context: Pick<LaneSafetyContext, "protected">): string | null;
export declare function lanesRootIssue(context: LaneSafetyContext): string | null;
export declare function laneWriteIssue(path: string, context: LaneSafetyContext): string | null;
export declare function servedTreeIssue(stRoot: string, env?: NodeJS.ProcessEnv, repoRoot?: string): string | null;
export declare function linksUnder(dir: string, limit?: number): string[];
export declare function createLaneFs(contextOf?: () => LaneSafetyContext): GuardedFs;
export declare function createHarnessFs(contextOf?: () => Pick<LaneSafetyContext, "protected">): GuardedFs;
export declare const laneFs: GuardedFs;
export declare const harnessFs: GuardedFs;
export declare function assertServedTree(stRoot: string, env?: NodeJS.ProcessEnv, repoRoot?: string): void;
export declare function assertLaneDir(path: string, context?: LaneSafetyContext): void;
