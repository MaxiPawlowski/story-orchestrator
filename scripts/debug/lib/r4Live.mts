import { evaluateInST } from './evaluate.mts';
import { payloadProof, R4_ARM_LEVEL, type R4Generation, type R4Line, type R4Side, type R4Turn, type R4TurnRecord } from './r4Pack.mts';

export interface R4CaptureEntry {
  url?: string;
  parsedBody?: unknown;
}

export interface R4LiveDeps {
  armCapture: (page: any) => Promise<unknown>;
  drain: (page: any, since: number) => Promise<{ nextIndex: number; entries: R4CaptureEntry[] }>;
  waitIdle: (page: any) => Promise<unknown>;
}

export interface R4TurnState {
  chatId: string | null;
  storyChat: string | null;
  storyId: string | null;
  checkpointId: string | null;
  declared: string | null;
  chatLength: number;
  flag: boolean;
  spikeLoaded: boolean;
}

const NEVER = Number.MAX_SAFE_INTEGER;

export async function readTurnState(page: any): Promise<R4TurnState> {
  return evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const checkpointId = rt?.getActiveCheckpointInfo?.()?.id ?? null;
    const story = rt?.getStory?.() ?? null;
    return {
      chatId: ctx.chatId ?? null,
      storyChat: rt?.getRunContext?.()?.chatId ?? null,
      storyId: rt?.getSnapshot?.()?.storyId ?? null,
      checkpointId,
      declared: (checkpointId && story?.checkpointById?.[checkpointId]?.effects?.reasoning) ?? null,
      chatLength: Array.isArray(ctx.chat) ? ctx.chat.length : 0,
      flag: rt?.getGlobalSettings?.()?.spikes?.reasoningEffect === true,
      spikeLoaded: Boolean((globalThis as any).storyOrchestratorSpikes?.reasoningEffect),
    };
  });
}

export function turnStateProblems(turn: R4Turn, state: R4TurnState): string[] {
  const problems: string[] = [];
  if (state.chatId !== turn.chatId) problems.push(`open chat is ${state.chatId ?? 'none'}, the turn declares ${turn.chatId}`);
  if (state.storyChat !== state.chatId) problems.push(`the loaded story belongs to ${state.storyChat ?? 'no chat'}, not the open chat`);
  if (state.storyId !== turn.storyId) problems.push(`story is ${state.storyId ?? 'none'}, the turn declares ${turn.storyId}`);
  if (state.checkpointId !== turn.checkpoint) problems.push(`active checkpoint is ${state.checkpointId ?? 'none'}, the turn declares ${turn.checkpoint}`);
  if (state.declared !== R4_ARM_LEVEL) problems.push(`checkpoint ${turn.checkpoint} declares effects.reasoning ${JSON.stringify(state.declared)}, the arm needs "${R4_ARM_LEVEL}"`);
  if (!state.spikeLoaded) problems.push('the R4 spike is not loaded in the page (dev build? storyOrchestratorSpikes.reasoningEffect missing)');
  if (state.chatLength < turn.contextMessages) problems.push(`the chat holds ${state.chatLength} messages, the turn asks for ${turn.contextMessages} of context`);
  return problems;
}

export async function readContext(page: any, count: number): Promise<R4Line[]> {
  return evaluateInST(page, (wanted: number) => {
    const chat = (globalThis as any).SillyTavern.getContext().chat ?? [];
    return chat.filter((message: any) => !message?.is_system).slice(-wanted).map((message: any) => ({ name: String(message?.name ?? ''), text: String(message?.mes ?? '') }));
  }, count);
}

export async function setReasoningFlag(page: any, on: boolean): Promise<void> {
  const after = await evaluateInST(page, (value: boolean) => {
    const rt = (globalThis as any).storyOrchestratorRuntime;
    rt.setSpikeFlags({ reasoningEffect: value });
    return rt.getGlobalSettings().spikes.reasoningEffect === true;
  }, on);
  if (after !== on) throw new Error(`spikes.reasoningEffect read back ${after} after setting ${on}`);
}

export interface R4Shot {
  latencyMs: number;
  before: number;
  after: number;
  speaker: string | null;
  reply: string;
  isUser: boolean;
  shot: unknown;
}

export async function generateOnce(page: any, member: string | null): Promise<R4Shot> {
  return evaluateInST(page, async (who: string | null) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const before = ctx.chat.length;
    const readShots = () => (globalThis as any).storyOrchestratorSpikes?.reasoningEffect?.shots?.() ?? [];
    const startedAt = Date.now();
    const command = who ? `/trigger await=true "${who.replace(/"/g, '\\"')}"` : '/trigger await=true';
    const started = performance.now();
    await ctx.executeSlashCommandsWithOptions(command);
    const latencyMs = performance.now() - started;
    const last = ctx.chat[ctx.chat.length - 1];
    const shots = readShots().filter((entry: any) => Number(entry?.at) >= startedAt);
    return {
      latencyMs,
      before,
      after: ctx.chat.length,
      speaker: last?.name ?? null,
      reply: last && !last.is_user ? String(last.mes ?? '') : '',
      isUser: Boolean(last?.is_user),
      shot: shots.length ? shots[0] : null,
    };
  }, member);
}

export async function removeReply(page: any, startLength: number): Promise<number> {
  return evaluateInST(page, async (expected: number) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    if (ctx.chat.length !== expected + 1) throw new Error(`expected exactly one new message (chat ${ctx.chat.length}, start ${expected}); nothing was deleted`);
    await ctx.deleteLastMessage();
    await ctx.saveChat?.();
    return ctx.chat.length;
  }, startLength);
}

export function mainRequest(entries: R4CaptureEntry[]): unknown {
  const generate = entries.filter((entry) => /\/api\/backends\/(chat-completions|text-completions)\/generate/.test(String(entry.url ?? '')));
  const loud = generate.find((entry) => (entry.parsedBody as { type?: unknown } | null)?.type === 'normal');
  return loud?.parsedBody ?? null;
}

export async function generateSide(page: any, turn: R4Turn, side: R4Side, order: number, startLength: number, deps: R4LiveDeps): Promise<R4Generation> {
  await setReasoningFlag(page, side === 'arm');
  await deps.waitIdle(page);
  const { nextIndex } = await deps.drain(page, NEVER);
  const shot = await generateOnce(page, turn.member);
  if (shot.after !== startLength + 1 || shot.isUser) throw new Error(`${turn.id} ${side}: expected one character reply, the chat went ${shot.before} -> ${shot.after}`);
  await deps.waitIdle(page);
  const { entries } = await deps.drain(page, nextIndex);
  const restored = await removeReply(page, startLength);
  if (restored !== startLength) throw new Error(`${turn.id} ${side}: the chat did not return to ${startLength} messages (holds ${restored})`);
  return { side, order, reply: shot.reply, speaker: shot.speaker, latencyMs: shot.latencyMs, payload: payloadProof(mainRequest(entries)), shot: shot.shot };
}

export async function runR4Turn(page: any, turn: R4Turn, { armFirst, deps }: { armFirst: boolean; deps: R4LiveDeps }): Promise<R4TurnRecord> {
  const state = await readTurnState(page);
  const problems = turnStateProblems(turn, state);
  if (problems.length) throw new Error(`${turn.id} is not ready:\n- ${problems.join('\n- ')}`);
  await deps.armCapture(page);
  const context = await readContext(page, turn.contextMessages);
  const sides: R4Side[] = armFirst ? ['arm', 'control'] : ['control', 'arm'];
  const generations: R4Generation[] = [];
  try {
    for (const [order, side] of sides.entries()) generations.push(await generateSide(page, turn, side, order, state.chatLength, deps));
  } finally {
    await setReasoningFlag(page, state.flag);
  }
  return { turnId: turn.id, context, generations };
}
