import { evaluateInST } from './evaluate.mts';

export const DEFAULT_MAIN_PROFILE = 'Artemis RunPod RP';
export const DEFAULT_ORCHESTRATOR = /deepseek/i;
export const PIN_ROLES = ['read', 'synthesis', 'authoring', 'director', 'curator', 'inner'] as const;
const SECRET_FIELD = /key|secret|token|password|auth/i;

export interface ProfileView { id: string; name: string | null; api: string | null; model: string | null; url: string | null; fields: Record<string, unknown> }
export interface RoleView { role: string; profileId: string | null; profileName: string | null; state: string | null; effort: unknown; reasoning: unknown }
export interface Routing {
  main: { selectedProfileId: string | null; selectedProfileName: string | null; mainApi: string | null; onlineStatus: string | null };
  profiles: ProfileView[];
  roles: RoleView[];
  judge: { enabled: boolean | null; uses: Record<string, boolean> | null; provider: unknown; pluginHttp: number | null; keyPresent: boolean | null };
  reasoning: { budget: unknown; powerUser: Record<string, unknown> };
}
export interface Probe { profile: string; ok: boolean; ms: number; text: string | null; error: string | null }

export async function selectMainProfile(page: any, name: string) {
  return evaluateInST(page, async (wanted: string) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const profiles = ctx.extensionSettings?.connectionManager?.profiles ?? [];
    const profile = profiles.find((candidate: any) => candidate?.name === wanted);
    if (!profile) return { ok: false, reason: `no Connection Manager profile named "${wanted}" (have ${profiles.map((candidate: any) => candidate?.name).join(', ')})` };
    await ctx.executeSlashCommandsWithOptions(`/profile ${wanted}`);
    const selected = ctx.extensionSettings?.connectionManager?.selectedProfile ?? null;
    return selected === profile.id ? { ok: true, id: profile.id } : { ok: false, reason: `"${wanted}" is ${profile.id}, the selected profile is ${String(selected)}` };
  }, name);
}

export async function readRouting(page: any): Promise<Routing> {
  return evaluateInST(page, async ({ secret }: { secret: string }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const secretField = new RegExp(secret, 'i');
    const cm = ctx.extensionSettings?.connectionManager ?? {};
    const profiles = (cm.profiles ?? []).map((profile: any) => ({
      id: String(profile?.id ?? ''),
      name: profile?.name ?? null,
      api: profile?.api ?? null,
      model: profile?.model ?? null,
      url: profile?.['api-url'] ?? null,
      fields: Object.fromEntries(Object.entries(profile ?? {}).filter(([key]) => !secretField.test(key))),
    }));
    const nameOf = (id: string | null) => profiles.find((profile: any) => profile.id === id)?.name ?? null;
    const settings = rt?.getGlobalSettings?.() ?? ctx.extensionSettings?.['story-orchestrator']?.settings ?? {};
    const snapshot = rt?.getSnapshot?.() ?? {};
    const roles = (snapshot.roleRoutes ?? []).map((route: any) => ({
      role: route.role, profileId: route.profileId ?? null, profileName: nameOf(route.profileId ?? null), state: route.state ?? null, effort: route.effort ?? null, reasoning: route.reasoning ?? null,
    }));
    const judgeEnabled = settings?.judge?.enabled === true;
    const plugin = await fetch('/api/plugins/story-orchestrator-judge/status', { headers: ctx.getRequestHeaders() })
      .then(async (response: any) => ({ http: response.status, body: response.ok ? await response.json().catch(() => null) : null }))
      .catch(() => ({ http: 0, body: null }));
    const power = ctx.powerUserSettings ?? {};
    return {
      main: { selectedProfileId: cm.selectedProfile ?? null, selectedProfileName: nameOf(cm.selectedProfile ?? null), mainApi: ctx.mainApi ?? null, onlineStatus: ctx.onlineStatus ?? null },
      profiles,
      roles,
      judge: {
        enabled: settings?.judge ? judgeEnabled : null,
        uses: settings?.judge?.uses ?? null,
        provider: settings?.judge?.provider ?? null,
        pluginHttp: plugin.http,
        keyPresent: plugin.body ? plugin.body.configured === true : null,
      },
      reasoning: {
        budget: settings?.extraction?.reasoningBudget ?? 'default',
        powerUser: Object.fromEntries(Object.entries(power.reasoning ?? {}).filter(([key]) => !secretField.test(key))),
      },
    };
  }, { secret: SECRET_FIELD.source });
}

export async function probeProfile(page: any, name: string, timeoutMs = 120000): Promise<Probe> {
  return evaluateInST(page, async ({ wanted, timeoutMs }: { wanted: string; timeoutMs: number }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const profile = (ctx.extensionSettings?.connectionManager?.profiles ?? []).find((candidate: any) => candidate?.name === wanted);
    const started = performance.now();
    if (!profile) return { profile: wanted, ok: false, ms: 0, text: null, error: 'no such profile' };
    const service = ctx.ConnectionManagerRequestService;
    if (!service?.sendRequest) return { profile: wanted, ok: false, ms: 0, text: null, error: 'ConnectionManagerRequestService is not on the context' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reply: any = await Promise.race([
        service.sendRequest(profile.id, [{ role: 'user', content: 'Reply with exactly: PONG' }], 16, { extractData: true, includePreset: true, includeInstruct: true, stream: false }, {}),
        new Promise((_, fail) => { timer = setTimeout(() => fail(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs); }),
      ]).finally(() => clearTimeout(timer));
      const text = typeof reply === 'string' ? reply : String(reply?.content ?? reply?.text ?? '');
      return { profile: wanted, ok: text.trim().length > 0, ms: Math.round(performance.now() - started), text: text.slice(0, 200), error: text.trim() ? null : 'empty reply' };
    } catch (error: any) {
      return { profile: wanted, ok: false, ms: Math.round(performance.now() - started), text: null, error: error?.message ?? String(error) };
    }
  }, { wanted: name, timeoutMs });
}

export interface PinExpectations { mainProfile: string; orchestrator: RegExp; judge: 'on' | 'off' | 'mixed' }

export function pinVerdict(routing: Routing, probe: Probe | null, expect: PinExpectations) {
  const problems: string[] = [];
  if (routing.main.selectedProfileName !== expect.mainProfile) problems.push(`main profile is "${routing.main.selectedProfileName ?? 'none'}", expected "${expect.mainProfile}"`);
  if (!probe) problems.push(`the main profile "${expect.mainProfile}" was not probed`);
  else if (!probe.ok) problems.push(`the main profile "${expect.mainProfile}" did not answer a tiny probe: ${probe.error ?? 'no text'}`);
  const byRole = new Map(routing.roles.map((role) => [role.role, role]));
  for (const role of PIN_ROLES) {
    const route = byRole.get(role);
    if (!route) { problems.push(`role "${role}" has no route in the snapshot`); continue; }
    if (!route.profileName) problems.push(`role "${role}" routes to no profile`);
    else if (!expect.orchestrator.test(route.profileName)) problems.push(`role "${role}" routes to "${route.profileName}", expected a profile matching ${expect.orchestrator}`);
    if (route.effort === null || route.effort === undefined) problems.push(`role "${role}" reports no reasoning effort`);
  }
  if (expect.judge === 'on' && routing.judge.enabled !== true) problems.push('the judge is off, the card expects it on');
  if (expect.judge === 'off' && routing.judge.enabled !== false) problems.push('the judge is on, the card switches it off');
  if (routing.judge.enabled && routing.judge.keyPresent !== true) problems.push(`the judge is on but its key is ${routing.judge.keyPresent === false ? 'absent' : 'unreadable'} (plugin http ${routing.judge.pluginHttp})`);
  return { ok: problems.length === 0, problems };
}

export const judgeExpectation = (judge: unknown): PinExpectations['judge'] => (judge === 'off' ? 'off' : judge && typeof judge === 'object' ? 'mixed' : 'on');
