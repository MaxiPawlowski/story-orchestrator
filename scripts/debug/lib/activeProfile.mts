import { NotRunnableError } from './imageHarnessConfig.mts';

export interface ActiveMain { mainApi: string | null; name: string | null; api: string | null; url: string | null }

export async function readActiveMain(page): Promise<ActiveMain> {
  return page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const manager = ctx.extensionSettings?.connectionManager;
    const profile = (manager?.profiles ?? []).find((entry) => entry.id === manager?.selectedProfile);
    return { mainApi: ctx.mainApi ?? null, name: profile?.name ?? null, api: profile?.api ?? null, url: profile?.['api-url'] ?? null };
  });
}

export function requireTextCompletionMain(main: ActiveMain, what: string): string {
  const problems: string[] = [];
  if (main.mainApi !== 'textgenerationwebui') problems.push(`${what} reads a Text Completion request, the main API is ${main.mainApi ?? 'unknown'}`);
  if (!main.url) problems.push(`${what} compares the request with the active Connection Manager profile's URL, and ${main.name ? `"${main.name}" has none` : 'no profile is selected'}`);
  if (problems.length) throw new NotRunnableError(problems);
  return main.url as string;
}

export const normalizedServer = (value: unknown) => String(value ?? '').trim().replace(/\/+$/, '').toLowerCase();
