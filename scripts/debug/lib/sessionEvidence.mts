import { evaluateInST } from './evaluate.mts';

export const EVIDENCE_SLICES = [
  'chat', 'snapshot', 'memory', 'chapters', 'canon', 'memoryQueue', 'epistemic', 'ledger', 'modelCalls', 'judgeCalls', 'stagecraft', 'talkDecisions', 'inline', 'journal', 'awayRecap',
] as const;
export type EvidenceSlice = (typeof EVIDENCE_SLICES)[number];

export interface FullChatMessage {
  id: number;
  name: string;
  isUser: boolean;
  isSystem: boolean;
  text: string;
  sendDate: string | null;
  swipeId: number | null;
  swipes: string[];
  swipeInfo: unknown[];
  reasoning: string | null;
  extra: Record<string, unknown>;
}

export interface Evidence {
  capturedAt: string;
  chatId: string | null;
  groupId: string | null;
  slices: Record<EvidenceSlice, unknown>;
  unread: Record<string, string>;
}

export async function captureEvidence(page: any): Promise<Evidence> {
  return evaluateInST(page, async () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const unread: Record<string, string> = {};
    const read = async (name: string, fn: () => unknown) => {
      try {
        const value = await fn();
        if (value === undefined) { unread[name] = 'the runtime returned nothing'; return null; }
        return value;
      } catch (error: any) {
        unread[name] = error?.message ?? String(error);
        return null;
      }
    };
    const snapshot: any = await read('snapshot', () => rt?.getSnapshot?.());
    const extras: any = rt?.extras ?? null;
    const chat = (Array.isArray(ctx.chat) ? ctx.chat : []).map((message: any, id: number) => ({
      id,
      name: String(message?.name ?? ''),
      isUser: Boolean(message?.is_user),
      isSystem: Boolean(message?.is_system),
      text: String(message?.mes ?? ''),
      sendDate: message?.send_date ? String(message.send_date) : null,
      swipeId: Number.isInteger(message?.swipe_id) ? message.swipe_id : null,
      swipes: Array.isArray(message?.swipes) ? message.swipes.map((swipe: unknown) => String(swipe ?? '')) : [],
      swipeInfo: Array.isArray(message?.swipe_info) ? message.swipe_info : [],
      reasoning: typeof message?.extra?.reasoning === 'string' ? message.extra.reasoning : null,
      extra: message?.extra && typeof message.extra === 'object' ? message.extra : {},
    }));
    const slices = {
      chat,
      snapshot,
      memory: snapshot?.memory ?? null,
      chapters: snapshot ? snapshot.chapters ?? { declared: false, records: snapshot.memory?.chapters ?? [] } : null,
      canon: await read('canon', () => ({ canon: rt?.getCanon?.() ?? null, prose: rt?.getCanonProse?.() ?? rt?.co?.memory?.canon?.getCanonProse?.() ?? null, memoryCanon: snapshot?.memory?.canon ?? null })),
      memoryQueue: await read('memoryQueue', () => ({ conflicts: rt?.memoryActions?.getConflicts?.() ?? snapshot?.memory?.conflicts ?? [], lastRefusal: rt?.memoryActions?.lastRefusal?.() ?? null })),
      epistemic: await read('epistemic', () => rt?.getEpistemic?.() ?? []),
      ledger: await read('ledger', () => rt?.getLedger?.() ?? []),
      modelCalls: await read('modelCalls', () => snapshot?.modelCallRing ?? extras?.modelCalls ?? []),
      judgeCalls: await read('judgeCalls', () => extras?.judge?.calls ?? null),
      stagecraft: await read('stagecraft', () => rt?.getStagecraftState?.() ?? snapshot?.stagecraft ?? null),
      talkDecisions: await read('talkDecisions', () => rt?.getTalkState?.()?.decisions ?? snapshot?.talk?.decisions ?? null),
      inline: snapshot?.inline ?? null,
      journal: await read('journal', () => rt?.getSessionJournal?.() ?? []),
      awayRecap: await read('awayRecap', () => ({ recap: rt?.getAwayRecap?.() ?? null, lastSessionAt: extras?.lastSessionAt ?? null })),
    };
    return { capturedAt: new Date().toISOString(), chatId: ctx.chatId ?? null, groupId: ctx.groupId ?? null, slices, unread };
  });
}

export function evidenceProblems(evidence: Pick<Evidence, 'slices' | 'unread'> | null | undefined): string[] {
  if (!evidence || typeof evidence !== 'object' || !evidence.slices) return ['no evidence was captured'];
  const problems: string[] = [];
  for (const slice of EVIDENCE_SLICES) {
    const value = (evidence.slices as Record<string, unknown>)[slice];
    if (value === undefined || value === null) problems.push(`slice "${slice}" is missing${evidence.unread?.[slice] ? `: ${evidence.unread[slice]}` : ''}`);
  }
  return problems;
}

export const digestChat = (chat: FullChatMessage[]) => chat.map((message) => ({ id: message.id, name: message.name, isUser: message.isUser, text: message.text }));

export function splitEvidence(evidence: Evidence) {
  const { chat, snapshot, ...rest } = evidence.slices;
  return {
    chatFull: chat as FullChatMessage[],
    snapshot,
    slices: rest,
  };
}
