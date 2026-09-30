export declare const REPO_ROOT: string;
export declare const ST_ROOT_FILE: string;
export declare function configuredStRoot(env?: NodeJS.ProcessEnv, repoRoot?: string): string | null;
export declare function stRootIssue(root: string | null): string | null;
export declare function requireStRoot(env?: NodeJS.ProcessEnv, repoRoot?: string): string;
export declare function lanesRootFor(env?: NodeJS.ProcessEnv, repoRoot?: string): string;
