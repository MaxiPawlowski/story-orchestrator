import { getContext } from "./context";
import { importSTModule } from "./modules";
import { listSlashCommands } from "./selectors";

export interface PersonasHostModule {
  user_avatar?: string;
  setUserAvatar?: (avatarId: string, options?: { toastPersonaNameChange?: boolean; navigateToCurrent?: boolean }) => Promise<void>;
  setPersonaLockState?: (state: boolean, type?: "chat" | "character" | "default") => Promise<void>;
}

export interface HostPersona {
  avatarId: string;
  name: string;
}

export interface HostPersonaRead {
  avatarId: string | null;
  name: string;
  description: string;
  descriptionSent: boolean;
  lockedAvatarId: string | null;
  personas: HostPersona[];
  canCreate: boolean;
}

let personasModule: PersonasHostModule | null = null;
let loading: Promise<PersonasHostModule | null> | null = null;

export const loadPersonasModule = (): Promise<PersonasHostModule | null> => {
  loading ??= importSTModule<PersonasHostModule>("/scripts/personas.js").then((module) => (personasModule = module)).catch(() => null);
  return loading;
};

const settings = () => getContext().powerUserSettings ?? {};

const ALWAYS_SENT_POSITIONS: ReadonlySet<number> = new Set([0, 1, 4]);

export const personaDescriptionSent = (position: unknown): boolean => position === undefined || (typeof position === "number" && ALWAYS_SENT_POSITIONS.has(position));

export const personaCrudAvailable = (): boolean => listSlashCommands().some((command) => command.name === "persona-create");

export function readPersonas(): HostPersonaRead {
  const context = getContext();
  const all = settings().personas ?? {};
  const locked = context.chatMetadata?.persona;
  return {
    avatarId: typeof personasModule?.user_avatar === "string" && personasModule.user_avatar ? personasModule.user_avatar : null,
    name: typeof context.name1 === "string" ? context.name1 : "",
    description: settings().persona_description ?? "",
    descriptionSent: personaDescriptionSent(settings().persona_description_position),
    lockedAvatarId: typeof locked === "string" && locked ? locked : null,
    personas: Object.entries(all).filter(([, name]) => typeof name === "string").map(([avatarId, name]) => ({ avatarId, name })),
    canCreate: personaCrudAvailable(),
  };
}
