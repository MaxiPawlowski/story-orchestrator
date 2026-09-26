const PREFIX = "[Story Orchestrator]";

export const DEBUG_OPT_IN_KEY = "story-orchestrator:debug";

declare const process: { env: Record<string, string | undefined> };

const devBuild = (): boolean => {
  try {
    return process.env.NODE_ENV === "development";
  } catch {
    return false;
  }
};

const optedIn = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(DEBUG_OPT_IN_KEY) === "on";
  } catch {
    return false;
  }
};

export const debugEnabled = (): boolean => devBuild() || optedIn();

export const log = {
  warn: (message: string, ...details: unknown[]): void => console.warn(`${PREFIX} ${message}`, ...details),
  info: (message: string, ...details: unknown[]): void => console.info(`${PREFIX} ${message}`, ...details),
  debug: (message: string, ...details: unknown[]): void => {
    if (debugEnabled()) console.debug(`${PREFIX} ${message}`, ...details);
  },
};
