export interface AgentCardState {
  status: string | null;
  busy: boolean;
  pending: { kind: string; text: string; applyEnabled?: boolean } | null;
  done?: string | null;
  error?: string | null;
}

export interface AgentCardDriver {
  state: () => Promise<AgentCardState>;
  click: (selector: string) => Promise<void>;
  settle: () => Promise<void>;
}

export type AgentCardKind = 'edit' | 'provision';

export interface AgentCardRun {
  handled: Array<{ kind: AgentCardKind; text: string }>;
  stop: string;
  state: AgentCardState;
}

export const AGENT_ACCEPT_SELECTOR = '#so-agent [data-so="agent-card"] [data-so="agent-accept"]';
export const AGENT_APPLY_SELECTOR = '#so-agent [data-so="agent-card"] [data-so="provisioning-apply"]';

export function parseCardCount(raw: string | undefined): number {
  if (raw === undefined || raw === 'all') return Number.POSITIVE_INFINITY;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) throw new Error(`expected a card count (1, 2, …) or "all", got "${raw}"`);
  return count;
}

const cardKind = (pending: AgentCardState['pending']): AgentCardKind | null => {
  if (!pending) return null;
  return pending.kind === 'provision' ? 'provision' : 'edit';
};

export async function runAgentCards(driver: AgentCardDriver, want: AgentCardKind, limit: number): Promise<AgentCardRun> {
  const handled: AgentCardRun['handled'] = [];
  let state = await driver.state();
  while (handled.length < limit) {
    if (state.busy) {
      await driver.settle();
      state = await driver.state();
      continue;
    }
    const kind = cardKind(state.pending);
    if (!kind) return { handled, stop: `no card waits (agent status ${state.status ?? 'none'})`, state };
    if (kind !== want) {
      const next = want === 'edit' ? 'a provisioning card waits: confirm it with agent-apply' : 'an edit card waits: decide it with agent-accept';
      return { handled, stop: next, state };
    }
    if (kind === 'provision' && state.pending?.applyEnabled === false) return { handled, stop: 'the provisioning card refuses this step (its Create it is disabled)', state };
    await driver.click(kind === 'edit' ? AGENT_ACCEPT_SELECTOR : AGENT_APPLY_SELECTOR);
    handled.push({ kind, text: state.pending?.text.slice(0, 300) ?? '' });
    await driver.settle();
    state = await driver.state();
  }
  return { handled, stop: `handled ${handled.length} card(s), the limit`, state };
}
