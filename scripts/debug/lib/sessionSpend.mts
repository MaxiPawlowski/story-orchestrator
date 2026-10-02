import type { Row } from './sessionDigest.mts';

export const ORCHESTRATOR_PATTERN = /deepseek/i;
export const CHARS_PER_TOKEN = 4;

export interface AnsweredBy { primary: number; fallback: number; failed: number }
export interface SpendBucket { calls: number; input: number; output: number; measuredCalls: number; estimatedCalls: number; costUsd: number | null }
export interface SessionSpend {
  orchestrator: SpendBucket & { ringCalls: number; ringCostUsd: number | null; answeredBy?: AnsweredBy };
  judge: { calls: number; cached: number; fallbacks: number; input: number; output: number; costUsd: number | null };
  main: { calls: number };
  responsesCaptured: number;
}

export const estimateTokens = (text: string) => Math.ceil(String(text ?? '').length / CHARS_PER_TOKEN);

const parse = (value: unknown) => {
  if (value && typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  try { return JSON.parse(value); } catch { return null; }
};

const timeOf = (value: unknown) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const inPlay = (at: unknown, playFrom: number | null) => playFrom === null || (timeOf(at) ?? Infinity) >= playFrom;

export function isOrchestratorRequest(entry: Record<string, any>, pattern = ORCHESTRATOR_PATTERN): boolean {
  const body = parse(entry.parsedBody ?? entry.body);
  if (!body) return false;
  return [body.model, body.chat_completion_source, body.custom_model_id, body.api_server, body.custom_url].some((value) => typeof value === 'string' && pattern.test(value));
}

const promptText = (body: Record<string, any> | null) => {
  if (!body) return '';
  if (Array.isArray(body.messages)) return body.messages.map((message: any) => (typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? ''))).join('\n');
  return typeof body.prompt === 'string' ? body.prompt : '';
};

const replyText = (response: Record<string, any> | null, raw: string) => {
  const choice = response?.choices?.[0];
  return String(choice?.message?.content ?? choice?.text ?? response?.content ?? (response ? '' : raw) ?? '');
};

const addCost = (total: number | null, value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? (total ?? 0) + value : total);

export function meterSession({ payloads, modelCalls = [], judgeCalls = [], playFrom = null, pattern = ORCHESTRATOR_PATTERN, orchestratorRoutes = [] }: {
  payloads: Row[]; modelCalls?: any[]; judgeCalls?: any[]; playFrom?: string | null; pattern?: RegExp; orchestratorRoutes?: string[];
}): SessionSpend {
  const from = timeOf(playFrom);
  const responses = new Map<string, Record<string, any>>();
  for (const row of payloads) if (row.value?.kind === 'response') responses.set(`${row.value.epoch}|${row.value.requestIndex}`, row.value);
  const answeredBy: AnsweredBy = { primary: 0, fallback: 0, failed: 0 };
  const orchestrator = { calls: 0, input: 0, output: 0, measuredCalls: 0, estimatedCalls: 0, costUsd: null as number | null, ringCalls: 0, ringCostUsd: null as number | null, answeredBy };
  const ours = (route: unknown) => route !== undefined && route !== null && (orchestratorRoutes.includes(String(route)) || pattern.test(String(route)));
  let mainCalls = 0;
  for (const row of payloads) {
    const entry = row.value;
    if (!entry || entry.unparsed || entry.kind === 'response' || !inPlay(entry.capturedAt, from)) continue;
    if (!isOrchestratorRequest(entry, pattern)) { mainCalls += 1; continue; }
    orchestrator.calls += 1;
    const response = responses.get(`${entry.epoch}|${entry.index}`) ?? null;
    const parsed = parse(response?.text ?? null);
    const usage = parsed?.usage;
    if (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number') {
      orchestrator.input += usage.prompt_tokens;
      orchestrator.output += usage.completion_tokens;
      orchestrator.measuredCalls += 1;
    } else {
      orchestrator.input += estimateTokens(promptText(parse(entry.parsedBody ?? entry.body)));
      orchestrator.output += estimateTokens(replyText(parsed, String(response?.text ?? '')));
      orchestrator.estimatedCalls += 1;
    }
  }
  for (const call of modelCalls) {
    if (!call || !inPlay(call.at, from) || !(ours(call.route) || ours(call.fallbackFrom))) continue;
    orchestrator.ringCalls += 1;
    if (call.fallbackFrom && (call.result === 'fallback' || call.result === 'ok')) answeredBy.fallback += 1;
    else if (call.result === 'ok') answeredBy.primary += 1;
    else answeredBy.failed += 1;
    orchestrator.ringCostUsd = addCost(orchestrator.ringCostUsd, call.usage?.costUsd);
  }
  orchestrator.costUsd = orchestrator.ringCostUsd;
  const judge = { calls: 0, cached: 0, fallbacks: 0, input: 0, output: 0, costUsd: null as number | null };
  for (const call of judgeCalls) {
    if (!call || !inPlay(call.at, from)) continue;
    if (call.cached) { judge.cached += 1; continue; }
    if (call.fallback) { judge.fallbacks += 1; if (!call.inputTokens) continue; }
    judge.calls += 1;
    judge.input += Number(call.inputTokens ?? 0);
    judge.output += Number(call.outputTokens ?? 0);
    judge.costUsd = addCost(judge.costUsd, call.cost);
  }
  return { orchestrator, judge, main: { calls: mainCalls }, responsesCaptured: responses.size };
}

export interface BudgetRow { session: string; lane: number; stoppedAt: string | null; spend: SessionSpend }

export const BUDGET_START = '<!-- sessions:start (generated by so-session budget) -->';
export const BUDGET_END = '<!-- sessions:end -->';

const usd = (value: number | null) => (value === null ? 'n/a' : `$${value.toFixed(4)}`);

const answered = (by: AnsweredBy | undefined) => (by ? `${by.primary} / ${by.fallback} / ${by.failed}` : 'n/a');

export function renderBudgetTable(rows: BudgetRow[]): string {
  const lines = [
    '| Session | Lane | Stopped | DeepSeek calls | DeepSeek tokens in/out | measured / estimated | DeepSeek cost | Judge calls (cached) | Judge tokens in/out | Judge cost | Main RP requests | Passes primary / fallback / failed |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const total = { calls: 0, input: 0, output: 0, cost: null as number | null, judge: 0, jin: 0, jout: 0, jcost: null as number | null, main: 0, by: { primary: 0, fallback: 0, failed: 0 } as AnsweredBy };
  for (const row of [...rows].sort((a, b) => a.session.localeCompare(b.session))) {
    const { orchestrator: o, judge: j, main } = row.spend;
    lines.push(`| \`${row.session}\` | ${row.lane} | ${row.stoppedAt ?? 'running'} | ${o.calls} | ${o.input} / ${o.output} | ${o.measuredCalls} / ${o.estimatedCalls} | ${usd(o.costUsd)} | ${j.calls} (${j.cached}) | ${j.input} / ${j.output} | ${usd(j.costUsd)} | ${main.calls} | ${answered(o.answeredBy)} |`);
    total.calls += o.calls; total.input += o.input; total.output += o.output; total.cost = o.costUsd === null ? total.cost : (total.cost ?? 0) + o.costUsd;
    total.judge += j.calls; total.jin += j.input; total.jout += j.output; total.jcost = j.costUsd === null ? total.jcost : (total.jcost ?? 0) + j.costUsd; total.main += main.calls;
    for (const key of ['primary', 'fallback', 'failed'] as const) total.by[key] += o.answeredBy?.[key] ?? 0;
  }
  lines.push(`| **Total** | | | ${total.calls} | ${total.input} / ${total.output} | | ${usd(total.cost)} | ${total.judge} | ${total.jin} / ${total.jout} | ${usd(total.jcost)} | ${total.main} | ${answered(total.by)} |`);
  return lines.join('\n');
}

export const BUDGET_TEMPLATE = [
  '# Plan 14 autonomous run: spend',
  '',
  'DeepSeek (orchestrator passes) and TypeSafe judge spend per session, written by `so-session stop` and `so-session budget`. "Passes primary / fallback / failed" counts the orchestrator model-call ring: answered by the memory model, answered by the fallback profile during an outage, or failed. Token counts are measured from the provider\'s `usage` where the response was captured, otherwise estimated at 4 characters per token (the measured / estimated column says which). Cost is what the product\'s model-call and judge rings recorded; `n/a` means no cost was reported.',
  '',
  '## Sessions',
  '',
  BUDGET_START,
  BUDGET_END,
  '',
  '## RunPod pod hours (the lead adds these by hand)',
  '',
  '| Date | Pod | GPU | $/h | Hours | Cost | Note |',
  '|---|---|---|---|---|---|---|',
  '',
].join('\n');

export function updateBudgetDocument(current: string | null, rows: BudgetRow[]): string {
  const base = current && current.includes(BUDGET_START) && current.includes(BUDGET_END) ? current.replace(/\r\n/g, '\n') : BUDGET_TEMPLATE;
  const start = base.indexOf(BUDGET_START) + BUDGET_START.length;
  const end = base.indexOf(BUDGET_END);
  return `${base.slice(0, start)}\n${renderBudgetTable(rows)}\n${base.slice(end)}`;
}
