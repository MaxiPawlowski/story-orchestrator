import type { WriteResult } from "@utils/writeResult";
import type { PersonaRead, PlayerSetupRecord } from "./playerSetup";
import type { RequirementsHost } from "./requirementsWatch";
import type { RunOwnership } from "./runToken";
import type { LoadedStory, RuntimeExtras } from "./types";

export interface PersonaHost {
  read: () => PersonaRead;
  select: (avatarId: string) => Promise<WriteResult<{ avatarId: string }>>;
  lock: () => Promise<WriteResult<{ avatarId: string }>>;
  create: (input: { name: string; description: string; title: string }) => Promise<WriteResult<{ avatarId: string }>>;
}

let host: PersonaHost | null = null;

export const installPersonaHost = (next: PersonaHost): (() => void) => {
  host = next;
  return () => { if (host === next) host = null; };
};

export const personaHost = (): PersonaHost | null => host;

export const personaRead = (): PersonaRead | null => {
  try {
    return host?.read() ?? null;
  } catch {
    return null;
  }
};

export type PlayerSetupRequest =
  | { choice: "keep" | "skip" }
  | { choice: "pick"; avatarId: string }
  | { choice: "create"; name: string; description: string };

export interface PlayerSetupDeps {
  extras: () => RuntimeExtras;
  loaded: () => LoadedStory | null;
  ownership: RunOwnership;
  persist: () => Promise<unknown>;
  notify: () => void;
  journal: (summary: string, detail: string) => void;
  requirements: Pick<RequirementsHost, "refresh" | "hydrate">;
}

export interface PlayerSetup {
  choose: (request: PlayerSetupRequest) => Promise<WriteResult<PlayerSetupRecord>>;
  autoResolve: () => Promise<boolean>;
  switchBack: () => Promise<WriteResult<{ avatarId: string }>>;
}

export const lazyPlayerSetup = (deps: PlayerSetupDeps): PlayerSetup => {
  let control: Promise<PlayerSetup> | null = null;
  const load = () => (control ??= import("./playerSetupControl").then(({ PlayerSetupControl }) => new PlayerSetupControl(deps)));
  return {
    choose: (request) => load().then((loaded) => loaded.choose(request)),
    autoResolve: () => (deps.extras().playerSetup?.pending ? load().then((loaded) => loaded.autoResolve()) : Promise.resolve(false)),
    switchBack: () => load().then((loaded) => loaded.switchBack()),
  };
};
