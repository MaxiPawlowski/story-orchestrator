export { getContext, getPlayerName, parseHostYaml, registerHostMacro, unregisterHostMacro } from "@services/stHost/context";
export type { HostArgMacro } from "@services/stHost/macroEngine";
export { showTextPopup, showConfirmPopup, showChoicePopup, askConfirm } from "@services/stHost/popup";
export { bindNavbarDrawerToggle, openGroupMemberList, toggleNavbarDrawer } from "@services/stHost/drawers";
export { readReplyText, rewriteReplyText, sendSystemChatMessage, type HostReplyText } from "@services/stHost/chatMessages";
export type { TextPopupOptions, ConfirmPopupOptions, ChoicePopupOptions, ConfirmAnswer } from "@services/stHost/popup";
export { readExtensionPromptBlocks, readInjectedPromptBlocks } from "@services/stHost/promptInspector";
export type { ExtensionPromptBlock, ExtensionPromptBlocks, InjectedPromptBlock } from "@services/stHost/promptInspector";
export { readPromptBudget } from "@services/stHost/contextBudget";
export { loadPersonasModule, readPersonas, type HostPersonaRead } from "@services/stHost/personas";
export const loadPersonaWrites = () => import("@services/stHost/personaWrites");
export { sendChatJump } from "@services/stHost/chatJump";
export type { PromptBudget, PromptBudgetRead } from "@services/stHost/contextBudget";
export { readPromptBuckets } from "@services/stHost/promptBuckets";
export type { PromptBucketsRead } from "@services/stHost/promptBucketsParse";
export type { StoryOrchestratorHostContext } from "@services/stHost/context";
export { subscribeToHostEvent, subscribeToHostEvents } from "@services/stHost/events";
export { mountInlineHosts, INLINE_HOST_PREFIX, INLINE_HOST_CLASS } from "@services/stHost/inlineMount";
export type { InlineHostSet } from "@services/stHost/inlineMount";
export type { HostEventPayloads, HostEventName, TypedHostEventHandler, HostSubscriptionEntry } from "@services/stHost/events";
export {
  BIAS_CACHE,
  displayLogitBias,
  tgPresetObjs,
  tgPresetNames,
  TG_SETTING_NAMES,
  setGenerationParamsFromPreset,
  getTextGenSettingNames,
  findTextGenPreset,
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
export {
  observeNextSave, observeNextSettingsSave, onGroupEdited, saveOpenChat, installSaveWatcher, startSaveWatcherSurface, readServerBoundary,
  readServerExtensionSettings, saveWatcherStats, boundaryInBlob, SAVE_OBSERVE_MS, type SaveObservation,
} from "@services/stHost/persistence";
export { applyCharacterAN, clearCharacterAN } from "@services/stHost/authorNotes";
export { setStoryExtensionPrompt, clearStoryExtensionPrompt } from "@services/stHost/extensionPrompts";
export {
  getWorldInfoSettings, enableWIEntry, disableWIEntry, upsertWIEntry, readWIEntry, readWIEntryAt, restoreWIEntryAt,
  updateWIEntryByUid, createLorebook, deleteLorebook, ensureLorebook, bindChatLorebook, unbindChatLorebook,
  deactivateGlobalLorebook, loadLorebook, loadScanLorebook, lorebookExists, listAllLorebooks, lorebookFileId,
} from "@services/stHost/worldInfo";
export type { ChatLorebookBinding, Lorebook, LoreEntry, WIUpsertResult, WIEntrySnapshot, WIEntryTarget } from "@services/stHost/worldInfo";
export { currentChatOwner, probeChatFile } from "@services/stHost/chatFiles";
export { isHostGeneratingFlag, listGroupChats, openStoryGroupChat, readGroupChatMetadata, type HostGroupChats } from "@services/stHost/groupChatFiles";
export { BADGE_REFRESH_EVENTS, mountStoryBadges, type StoryBadge, type StoryBadgeHandle, type StoryBadgeSource } from "@services/stHost/charListBadges";
export { mountStoryWand, type WandEntry, type WandHandle } from "@services/stHost/storyWand";
export type { ChatOwner, ChatPresence } from "@services/stHost/chatFiles";
export { applyBackground, backgroundExists, getCurrentBackground, listBackgrounds } from "@services/stHost/backgrounds";
export type { CurrentBackground } from "@services/stHost/backgrounds";
export { createCharacterCard, createGroup, listGroupNames } from "@services/stHost/provisioning";
export type { CharacterCardInput } from "@services/stHost/provisioning";
export {
  listActiveWorldInfoComments,
  listGlobalLorebooks,
  readLoreBindings,
  listGroupMembers,
  listMutedGroupMembers,
  listLorebookComments,
  listPersonas,
  listSlashCommands,
} from "@services/stHost/selectors";
export type { HostLoreBindings, HostSlashCommandMeta } from "@services/stHost/selectors";
export {
  addGroupMembers, getActiveGroup, openGroupById, resolveGroupMemberId, setGroupMembersDisabled, setGroupMemberDisabled, setGroupMemberFlags, readGroupMemberDisabled,
} from "@services/stHost/groups";
export { fillChatInput, guardHostStream, readChatInput, watchHostChatMove, hostSystemUserName, isHostGenerating, stopHostGeneration, willAddUserMessage } from "@services/stHost/generation";
export { startGroupVoice } from "@services/stHost/generation";
export { forceActivateEntries, getScannableEntries, type HostScannableEntry } from "@services/stHost/worldInfoActivate";
export { readLorebookEntries, setLorebookEntriesDisabled } from "@services/stHost/worldInfoFiles";
export { observeWorldInfoScans, loadedEntries, type HostEntriesLoaded, type WorldInfoScanObservation } from "@services/stHost/worldInfoEvidence";
export { observeSamplerPayloads, readSamplerPreset, samplerApi, type SamplerPayloadHandlers } from "@services/stHost/samplerOverlay";
export {
  installScanGating, installStoryLoreScan, probeScanGating, vectorsScanWorldInfo, type ScanGatingHandle, type StoryLoreScanHandle,
} from "@services/stHost/worldInfoScan";
export { getSelectedConnectionProfileId, listConnectionProfiles, profileExists, sendConnectionProfileRequest } from "@services/stHost/connectionProfiles";
export type { ModelFailureKind, ModelFinish, ModelReply, ModelRequestOptions, ModelSamplers, ModelUsage, ReasoningMeter } from "@services/stHost/modelReply";
export { harnessContextLimit, harnessListed, harnessStatusCached, openAgentBridge, refreshHarnessStatus, sendHarness } from "@services/stHost/harnessCache";
export type { HarnessModel, HarnessRequest, HarnessRow, HarnessStatus } from "@services/stHost/harness";
export type { ConnectionProfileSummary } from "@services/stHost/connectionProfiles";
export { countTokens, countTokensBatch, tokenizerIdentity } from "@services/stHost/tokenizer";
export { readProfileContextLimit, readProfilePresetName } from "@services/stHost/contextLimit";
export { vectorInsert, vectorQuery, vectorPurge, DEFAULT_VECTOR_SOURCE } from "@services/stHost/vectors";
export { judgeLlamaComplete, judgeStatus, judgeTransport, writeJudgeSecret, JUDGE_PLUGIN_BASE, JUDGE_PLUGIN_ID, JUDGE_SECRET_KEY, type JudgeStatus } from "@services/stHost/judge";
export type { VectorItem, VectorMatch } from "@services/stHost/vectors";
export { probeCapability, capabilityReport, capabilityState, invalidateCapabilities, hostFacts, renderCapabilityReport, CAPABILITY_IDS } from "@services/stHost/capabilities";
export type { CapabilityId, CapabilityReport, CapabilityState, HostFacts } from "@services/stHost/capabilities";
export { getHostVersion, macroEngineInUse } from "@services/stHost/version";
export type { HostVersion } from "@services/stHost/version";

