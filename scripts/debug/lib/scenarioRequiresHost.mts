import { evaluateInST } from './evaluate.mts';
import { applyJudgeMode } from './judgeHarness.mts';
import { membersToEnable, requiresProblems, type RequiresFacts, type ScenarioRequires } from './scenarioRequires.mts';
import { comfyCleared, harnessGaps } from './imageHarnessConfig.mts';
import { laneHarness } from './imageHarness.mts';

export async function readRequiresFacts(page, requires: ScenarioRequires): Promise<RequiresFacts> {
  const imageCheck = Boolean(requires.comfy || requires.imageHarness?.length);
  const loaded = imageCheck ? laneHarness() : null;
  const cleared = Boolean(loaded && comfyCleared(process.env, loaded.config));
  const facts: RequiresFacts = await evaluateInST(page, async ({ probe, comfy, lane }) => {
    const ctx = SillyTavern.getContext();
    const group = (ctx.groups ?? []).find((entry) => String(entry.id) === String(ctx.groupId)) ?? null;
    const disabled = new Set((group?.disabled_members ?? []).map(String));
    const members = (group?.members ?? []).map((avatar) => ({ avatar: String(avatar), name: String((ctx.characters ?? []).find((character) => character.avatar === avatar)?.name ?? avatar), disabled: disabled.has(String(avatar)) }));
    const settings = globalThis.storyOrchestratorRuntime?.getGlobalSettings?.() ?? null;
    const profiles = ctx.extensionSettings?.connectionManager?.profiles ?? [];
    const modeOf = (id) => (id ? profiles.find((profile) => profile.id === id)?.mode ?? null : null);
    const roles = ['read', 'synthesis', 'authoring', 'director', 'curator', 'inner'];
    const routed = (role) => {
      const entry = settings?.extraction?.profiles?.[role];
      if (typeof entry === 'string' && entry) return modeOf(entry);
      if (entry && typeof entry === 'object') return entry.route?.kind === 'harness' ? 'harness' : modeOf(entry.route?.profileId ?? entry.profileId ?? settings?.extraction?.profileId);
      return modeOf(settings?.extraction?.profileId);
    };
    let modelReachable = null;
    let modelProbe = null;
    if (probe) {
      const id = settings?.extraction?.profileId ?? null;
      const service = ctx.ConnectionManagerRequestService;
      if (!id) { modelReachable = false; modelProbe = 'no memory profile selected'; }
      else if (typeof service?.sendRequest !== 'function') modelProbe = 'ConnectionManagerRequestService missing';
      else {
        try {
          const answer = await Promise.race([
            service.sendRequest(id, [{ role: 'user', content: 'Reply with exactly: PONG' }], 16, { extractData: true, includePreset: true, includeInstruct: true, stream: false }, {}),
            new Promise((_, reject) => setTimeout(() => reject(new Error('no answer within 60 s')), 60000)),
          ]);
          const text = String(answer?.content ?? answer ?? '');
          modelReachable = text.trim().length > 0;
          modelProbe = modelReachable ? 'answered' : 'empty answer';
        } catch (error) {
          modelReachable = false;
          modelProbe = String(error?.message ?? error).slice(0, 160);
        }
      }
    }
    let comfyFacts = null;
    if (comfy) {
      comfyFacts = { cleared: true, plugin: null, discovered: null, probe: null };
      if (lane === 'model' && modelReachable !== true) comfyFacts.probe = 'not probed: the lane has no live model';
      else {
        try {
          const status = await fetch('/api/plugins/story-orchestrator-media/status', { headers: ctx.getRequestHeaders() });
          comfyFacts.plugin = status.status === 404 ? 'absent' : status.ok ? 'present' : 'error';
          if (!status.ok && status.status !== 404) comfyFacts.probe = `status ${status.status}`;
          if (status.ok) {
            const response = await fetch('/api/plugins/story-orchestrator-media/discover', { headers: ctx.getRequestHeaders() });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data) comfyFacts.probe = String(data?.error ?? `discover ${response.status}`).slice(0, 160);
            else {
              const list = (value) => (Array.isArray(value) ? value.map(String) : []);
              comfyFacts.discovered = { diffusionModels: list(data.diffusionModels), textEncoders: list(data.textEncoders), vaes: list(data.vaes), checkpoints: list(data.checkpoints),
                alpha: (Array.isArray(data.alpha) ? data.alpha : []).map((entry) => String(entry?.id ?? '')).filter(Boolean) };
            }
          }
        } catch (error) {
          comfyFacts.plugin = comfyFacts.plugin ?? 'error';
          comfyFacts.probe = String(error?.message ?? error).slice(0, 160);
        }
      }
    }
    return {
      groupId: group ? String(group.id) : null,
      groupName: group?.name ?? null,
      members,
      mainApi: ctx.mainApi ?? null,
      roleModes: settings ? Object.fromEntries(roles.map((role) => [role, routed(role)])) : {},
      macroEngine: ctx.powerUserSettings?.experimental_macro_engine === true,
      vectorsWorldInfo: ctx.extensionSettings?.vectors?.enabled_world_info === true,
      modelReachable,
      modelProbe,
      comfy: comfyFacts,
      profileNames: profiles.map((profile) => String(profile?.name ?? '')).filter(Boolean),
    };
  }, { probe: Boolean(requires.lane), comfy: Boolean(requires.comfy) && cleared, lane: requires.lane ?? null });
  if (requires.comfy && !facts.comfy) facts.comfy = { cleared, plugin: null, discovered: null, probe: null };
  if (loaded) facts.harness = { path: loaded.path, gaps: harnessGaps(loaded, requires.imageHarness ?? []), config: loaded.config };
  return facts;
}

export async function enableGroupMembers(page, avatars: string[]) {
  if (!avatars.length) return { enabled: [] };
  return evaluateInST(page, async (wanted) => {
    const ctx = SillyTavern.getContext();
    const group = (ctx.groups ?? []).find((entry) => String(entry.id) === String(ctx.groupId));
    if (!group) throw new Error('no group is open');
    group.disabled_members = (group.disabled_members ?? []).filter((avatar) => !wanted.includes(avatar));
    const chats = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { editGroup: (id: string, immediately: boolean, reload: boolean) => Promise<void> };
    await chats.editGroup(group.id, true, false);
    const response = await fetch('/api/groups/all', { method: 'POST', headers: ctx.getRequestHeaders() });
    const saved = (await response.json()).find((entry) => String(entry.id) === String(group.id));
    const still = (saved?.disabled_members ?? []).filter((avatar) => wanted.includes(avatar));
    if (still.length) throw new Error(`re-enabling ${still.join(', ')} did not reach the server`);
    return { enabled: wanted };
  }, avatars);
}

export async function setAuthorView(page, on: boolean) {
  return evaluateInST(page, (value) => {
    const rt = globalThis.storyOrchestratorRuntime;
    if (typeof rt?.setUiSettings !== 'function') throw new Error('storyOrchestratorRuntime.setUiSettings missing');
    rt.setUiSettings({ authorView: value });
    return rt.getSnapshot?.()?.ui?.authorView === value;
  }, on);
}

export interface RequiresOutcome {
  facts: RequiresFacts;
  problems: string[];
  reenabled: string[];
  authorView: boolean | null;
  judgeOff: boolean;
}

export async function establishGroupRequires(page, requires: ScenarioRequires): Promise<string[]> {
  if (!requires.members?.length) return [];
  const facts = await readRequiresFacts(page, { ...requires, lane: undefined });
  const avatars = membersToEnable(requires, facts);
  await enableGroupMembers(page, avatars);
  return avatars;
}

export async function establishChatRequires(page, requires: ScenarioRequires, reenabled: string[]): Promise<RequiresOutcome> {
  let authorView: boolean | null = null;
  if (requires.authorView) authorView = await setAuthorView(page, true);
  if (requires.judge === 'off') await applyJudgeMode(page, { label: 'off', uses: [] });
  const facts = await readRequiresFacts(page, requires);
  const problems = requiresProblems(requires, facts);
  if (requires.authorView && authorView !== true) problems.push('needs Author view, and it did not switch on');
  return { facts, problems, reenabled, authorView, judgeOff: requires.judge === 'off' };
}
