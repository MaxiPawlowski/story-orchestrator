import { evaluateInST } from './evaluate.mts';
import type { ChatRef } from './sessionArtifacts.mts';

export const CONTEXT_MESSAGES = 8;

export interface TranscriptMessage { id: number; name: string; isUser: boolean; isSystem: boolean; text: string; swipeId: number | null; swipes: string[] }

export async function readWhere(page: any): Promise<ChatRef & { activeCheckpointId: string | null; boundary: number | null }> {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const snapshot = (globalThis as any).storyOrchestratorRuntime?.getSnapshot?.() ?? {};
    const group = (ctx.groups ?? []).find((candidate: any) => candidate.id === ctx.groupId);
    return {
      chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, group: group?.name ?? null, storyId: snapshot.storyId ?? null,
      activeCheckpointId: snapshot.activeCheckpointId ?? null, boundary: typeof snapshot.boundary === 'number' ? snapshot.boundary : null,
    };
  });
}

export async function readChatInventory(page: any): Promise<ChatRef[]> {
  return evaluateInST(page, async () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    if (typeof ctx.getCharacters === 'function') await ctx.getCharacters();
    return (ctx.groups ?? []).flatMap((group: any) => (Array.isArray(group.chats) ? group.chats : []).map((chatId: string) => ({ chatId: String(chatId), group: group.name ?? null, groupId: group.id ?? null })));
  });
}

export async function readTranscript(page: any): Promise<{ chatId: string | null; messages: TranscriptMessage[] }> {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    return {
      chatId: ctx.chatId ?? null,
      messages: chat.map((message: any, id: number) => ({
        id, name: String(message?.name ?? ''), isUser: Boolean(message?.is_user), isSystem: Boolean(message?.is_system), text: String(message?.mes ?? ''),
        swipeId: Number.isInteger(message?.swipe_id) ? message.swipe_id : null,
        swipes: Array.isArray(message?.swipes) ? message.swipes.map((swipe: unknown) => String(swipe ?? '')) : [],
      })),
    };
  });
}

export async function readObservation(page: any) {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const snapshot = rt?.getSnapshot?.() ?? {};
    const group = (ctx.groups ?? []).find((candidate: any) => candidate.id === ctx.groupId);
    const captures = rt?.getPayloadCaptures?.() ?? [];
    const latest = captures[0] ?? null;
    return {
      chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, group: group?.name ?? null, storyId: snapshot.storyId ?? null,
      activeCheckpointId: snapshot.activeCheckpointId ?? null, boundary: typeof snapshot.boundary === 'number' ? snapshot.boundary : null,
      folded: typeof latest?.folded === 'number' ? latest.folded : null,
      payloadEpoch: (globalThis as any).__soDebugPayloads?.epoch ?? null,
    };
  });
}

export const contextOf = (messages: TranscriptMessage[], size = CONTEXT_MESSAGES) => messages.slice(-size).map((message) => ({ id: message.id, name: message.name, isUser: message.isUser, text: message.text }));

export async function readRuntimeBlob(page: any) {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const blob = ctx.chatMetadata?.story_orchestrator ?? null;
    return blob ? JSON.parse(JSON.stringify(blob)) : null;
  });
}

export async function readWizardDrafts(page: any) {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const root = ctx.extensionSettings?.['story-orchestrator'] ?? {};
    const sessions = Array.isArray(root.wizardSessions) ? root.wizardSessions : [];
    const store = (globalThis as any).storyOrchestratorStudioDraft;
    const draft = store?.getState?.()?.draft ?? null;
    const library = Array.isArray(root.v2Stories) ? root.v2Stories : [];
    return {
      sessions: JSON.parse(JSON.stringify(sessions)),
      openDraft: draft ? JSON.parse(JSON.stringify(draft)) : null,
      library: library.map((record: any) => ({ id: record?.id ?? record?.story?.id ?? null, title: record?.title ?? record?.story?.title ?? null, version: record?.version ?? record?.story?.version ?? null })),
    };
  });
}

export async function readHostSwipes(page: any): Promise<{ swipes: boolean | null }> {
  return evaluateInST(page, () => {
    const box = (globalThis as any).document?.getElementById?.('swipes-checkbox');
    return { swipes: box ? Boolean(box.checked) : null };
  });
}

export async function readEffectiveSettings(page: any) {
  return evaluateInST(page, () => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const settings = rt?.getGlobalSettings?.() ?? null;
    return settings ? JSON.parse(JSON.stringify(settings)) : null;
  });
}
