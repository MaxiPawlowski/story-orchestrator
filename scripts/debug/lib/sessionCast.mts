import { evaluateInST } from './evaluate.mts';

export interface CastPlan { enabled?: string[]; disabled?: string[] }
export interface CastResult { ok: boolean; changed: string[]; problems: string[]; disabledAfter: string[] }

export async function ensureCast(page: any, plan: CastPlan): Promise<CastResult> {
  return evaluateInST(page, async (wanted: CastPlan) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const read = () => {
      const group = (ctx.groups ?? []).find((candidate: any) => candidate.id === ctx.groupId) ?? null;
      const avatarOf = (name: string) => (ctx.characters ?? []).find((character: any) => character.name === name)?.avatar ?? null;
      const off = new Set<string>(group?.disabled_members ?? []);
      return { group, avatarOf, off };
    };
    const rows: Array<[string, boolean]> = [...(wanted.enabled ?? []).map((name): [string, boolean] => [name, true]), ...(wanted.disabled ?? []).map((name): [string, boolean] => [name, false])];
    const before = read();
    if (!before.group) return { ok: false, changed: [], problems: ['no group chat is open, so the card\'s members cannot be set'], disabledAfter: [] };
    const changed: string[] = [];
    const problems: string[] = [];
    for (const [name, on] of rows) {
      const avatar = before.avatarOf(name);
      if (!avatar || !(before.group.members ?? []).includes(avatar)) {
        problems.push(`${name} is not a member of ${before.group.name}`);
        continue;
      }
      if (!before.off.has(avatar) === on) continue;
      await ctx.executeSlashCommandsWithOptions(`/member-${on ? 'enable' : 'disable'} ${JSON.stringify(name)}`);
      changed.push(`${on ? '+' : '-'}${name}`);
    }
    const after = read();
    for (const [name, on] of rows) {
      const avatar = after.avatarOf(name);
      if (avatar && (after.group.members ?? []).includes(avatar) && !after.off.has(avatar) !== on) problems.push(`${name} is still ${on ? 'disabled' : 'enabled'} after /member-${on ? 'enable' : 'disable'}`);
    }
    const names = (avatar: string) => (ctx.characters ?? []).find((character: any) => character.avatar === avatar)?.name ?? avatar;
    return { ok: problems.length === 0, changed, problems, disabledAfter: [...after.off].map(names).sort() };
  }, plan);
}
