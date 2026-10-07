import { couldNot, type WriteResult } from "@utils/writeResult";
import type { PersonaRead } from "./playerSetup";
import type { PersonaHost, StillOwns } from "./playerSetupPort";

export const PERSONA_LAPSED = "the chat changed before SillyTavern's persona was changed";
export const PERSONA_UNLOADED = "SillyTavern's persona controls did not load";

export interface PersonaWriter {
  selectPersona: (avatarId: string, owns: StillOwns) => Promise<WriteResult<{ avatarId: string }>>;
  lockPersonaToChat: (owns: StillOwns) => Promise<WriteResult<{ avatarId: string }>>;
  createPersona: (input: { name: string; description: string; title: string }, owns: StillOwns) => Promise<WriteResult<{ avatarId: string }>>;
}

export function livePersonaHost(load: () => Promise<PersonaWriter>, read: () => PersonaRead, warn: (error: unknown) => void): PersonaHost {
  const write = <T extends object>(owns: StillOwns, run: (writer: PersonaWriter) => Promise<WriteResult<T>>): Promise<WriteResult<T>> =>
    Promise.resolve().then(load).then((writer) => (owns() ? run(writer) : couldNot(PERSONA_LAPSED))).catch((error: unknown) => {
      warn(error);
      return couldNot(PERSONA_UNLOADED);
    });
  return {
    read,
    select: (avatarId, owns) => write(owns, (writer) => writer.selectPersona(avatarId, owns)),
    lock: (owns) => write(owns, (writer) => writer.lockPersonaToChat(owns)),
    create: (input, owns) => write(owns, (writer) => writer.createPersona(input, owns)),
  };
}
