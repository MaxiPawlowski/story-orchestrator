import { getContext } from "./context";
import { loadPersonasModule, personaCrudAvailable } from "./personas";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { quoteSlashArg } from "@utils/string";

const PARSER_FLAGS = { 1: true, 2: false };

const listed = () => getContext().powerUserSettings?.personas ?? {};

export async function selectPersona(avatarId: string): Promise<WriteResult<{ avatarId: string }>> {
  const module = await loadPersonasModule();
  if (!module?.setUserAvatar) return couldNot("this SillyTavern build exposes no persona switch");
  if (!(avatarId in listed())) return couldNot(`no persona with the avatar ${avatarId}`);
  await module.setUserAvatar(avatarId, { toastPersonaNameChange: false });
  return module.user_avatar === avatarId ? wrote({ avatarId }) : couldNot("SillyTavern did not switch to that persona");
}

export async function lockPersonaToChat(): Promise<WriteResult<{ avatarId: string }>> {
  const module = await loadPersonasModule();
  if (!module?.setPersonaLockState) return couldNot("this SillyTavern build exposes no persona lock");
  await module.setPersonaLockState(true, "chat");
  const avatarId = module.user_avatar ?? "";
  return avatarId && getContext().chatMetadata?.persona === avatarId ? wrote({ avatarId }) : couldNot("the chat did not take the persona lock");
}

export async function createPersona(input: { name: string; description: string; title: string }): Promise<WriteResult<{ avatarId: string }>> {
  if (!personaCrudAvailable()) return couldNot("this SillyTavern version cannot create personas from here");
  const command = `/persona-create select=false name=${quoteSlashArg(input.name)} title=${quoteSlashArg(input.title)} description=${quoteSlashArg(input.description)}`;
  const result = await getContext().executeSlashCommandsWithOptions(command, { handleParserErrors: false, handleExecutionErrors: true, parserFlags: PARSER_FLAGS });
  const avatarId = typeof result?.pipe === "string" ? result.pipe.trim() : "";
  if (result?.isError || !avatarId) return couldNot(result?.errorMessage ?? "SillyTavern did not create the persona");
  return avatarId in listed() ? wrote({ avatarId }) : couldNot("the new persona is not in SillyTavern's list");
}
