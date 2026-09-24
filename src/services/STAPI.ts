export { getContext, getPlayerName, registerHostMacro, unregisterHostMacro } from "@services/stHost/context";
export { showTextPopup, showConfirmPopup, showChoicePopup } from "@services/stHost/popup";
export { bindNavbarDrawerToggle, toggleNavbarDrawer } from "@services/stHost/drawers";
export { sendSystemChatMessage } from "@services/stHost/chatMessages";
export type { TextPopupOptions, ConfirmPopupOptions, ChoicePopupOptions } from "@services/stHost/popup";
export { readInjectedPromptBlocks } from "@services/stHost/promptInspector";
export type { InjectedPromptBlock } from "@services/stHost/promptInspector";
export type { StoryOrchestratorHostContext } from "@services/stHost/context";
export { subscribeToHostEvent, subscribeToHostEvents } from "@services/stHost/events";
export type { HostEventPayloads, HostEventName, TypedHostEventHandler, HostSubscriptionEntry } from "@services/stHost/events";
export {
  BIAS_CACHE,
  displayLogitBias,
  tgPresetObjs,
  tgPresetNames,
  TG_SETTING_NAMES,
  setSettingByName,
  setGenerationParamsFromPreset,
  getTextGenSettingNames,
  findTextGenPreset,
  applyPreset,
  presetBackend,
  readAppliedPreset,
  PRESET_UNSUPPORTED_REASON,
  type PresetBackend,
  type TextGenPreset,
} from "@services/stHost/presets";
export type { WriteResult } from "@utils/writeResult";
export { settingsReady, settingsAreLoaded, noteHostSettingsLoaded, EXTENSION_SETTINGS_LOADED_EVENT } from "@services/stHost/context";
export {
  getActiveCharacterId,
  getCharacterNameById,
  getCharacterIdByName,
  getAllCharacterNames,
  getCharacters,
  getMessageTimeStamp,
} from "@services/stHost/characters";
export { executeSlashCommands } from "@services/stHost/slashCommands";
export { observeNextSave, installSaveWatcher, readServerBoundary, boundaryInBlob, SAVE_OBSERVE_MS, type SaveObservation } from "@services/stHost/persistence";
export { applyCharacterAN, clearCharacterAN } from "@services/stHost/authorNotes";
export { setStoryExtensionPrompt, clearStoryExtensionPrompt } from "@services/stHost/extensionPrompts";
export { getWorldInfoSettings, enableWIEntry, disableWIEntry, upsertWIEntry, readWIEntry, readWIEntryAt, restoreWIEntryAt, createLorebook, ensureLorebook, bindChatLorebook, activateGlobalLorebook, loadLorebook, lorebookExists, listAllLorebooks, lorebookFileId } from "@services/stHost/worldInfo";
export type { ChatLorebookBinding, Lorebook, LoreEntry, WIUpsertResult, WIEntrySnapshot, WIEntryTarget } from "@services/stHost/worldInfo";
export { applyBackground, backgroundExists, getCurrentBackground, listBackgrounds } from "@services/stHost/backgrounds";
export type { CurrentBackground } from "@services/stHost/backgrounds";
export { createCharacterCard, createGroup, listGroupNames } from "@services/stHost/provisioning";
export type { CharacterCardInput } from "@services/stHost/provisioning";
export {
  listActiveWorldInfoComments,
  listGlobalLorebooks,
  listGroupMembers,
  listLorebookComments,
  listPersonas,
  listSlashCommands,
} from "@services/stHost/selectors";
export type { HostSlashCommandMeta } from "@services/stHost/selectors";
export { getActiveGroup, resolveGroupMemberId, setGroupMembersDisabled, setGroupMemberDisabled, readGroupMemberDisabled } from "@services/stHost/groups";
export { hostSystemUserName, isHostGenerating, willAddUserMessage } from "@services/stHost/generation";
export { forceActivateEntries, getScannableEntries, type HostScannableEntry } from "@services/stHost/worldInfoActivate";
export { getSelectedConnectionProfileId, listConnectionProfiles, sendConnectionProfileRequest } from "@services/stHost/connectionProfiles";
export type { ConnectionProfileSummary } from "@services/stHost/connectionProfiles";
export { countTokens, countTokensBatch } from "@services/stHost/tokenizer";
export { vectorInsert, vectorQuery, vectorPurge, DEFAULT_VECTOR_SOURCE } from "@services/stHost/vectors";
export { judgeStatus, judgeTransport, writeJudgeSecret, JUDGE_PLUGIN_BASE, JUDGE_PLUGIN_ID, JUDGE_SECRET_KEY, type JudgeStatus } from "@services/stHost/judge";
export type { VectorItem, VectorMatch } from "@services/stHost/vectors";
export { probeCapability, capabilityReport, capabilityState, invalidateCapabilities, hostFacts, renderCapabilityReport, CAPABILITY_IDS } from "@services/stHost/capabilities";
export type { CapabilityId, CapabilityReport, CapabilityState, HostFacts } from "@services/stHost/capabilities";
export { getHostVersion, macroEngineInUse } from "@services/stHost/version";
export type { HostVersion } from "@services/stHost/version";

