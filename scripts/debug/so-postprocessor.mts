import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { evaluateInST } from './lib/evaluate.mts';
import { injectScript } from './lib/interopVerbs.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';
import { saveSettingsNow } from './lib/settingsSave.mts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const POSTPROCESSOR_DIR = join(ROOT, 'test', 'fixtures', 'postprocessor');
export const REGEX_FIXTURE = join(POSTPROCESSOR_DIR, 'so-v3-typographic-quotes.regex.json');
export const PAGE_SCRIPT = 'so-v3-postprocessor.js';
export const POSTPROCESSOR_MARKER = 'SO-V3';
export const BURSTS = ['single', 'double', 'late'] as const;
export type Burst = typeof BURSTS[number];

const USAGE = `Usage: node scripts/debug/so-postprocessor.mts install [--no-regex] [--post-render] [--burst single|double|late] [--append <text>] [--append-first <text>] [--delay <ms>] [--late <ms>] [--quiet <ms>] [--in-round]
       node scripts/debug/so-postprocessor.mts remove | status

v2.7 33 W1 V0/V3 reference reply post-processor (test-only). Two placements of one transform,
${POSTPROCESSOR_MARKER} typographic quotes (test/fixtures/postprocessor/so-v3-typographic-quotes.regex.json):

  regex        the stock Regex extension script (global, AI output, alters the chat). ST runs it inside
               cleanUpMessage, before saveReply pushes the reply, so the reply is already rewritten when
               MESSAGE_RECEIVED fires and no MESSAGE_EDITED is emitted. The control leg: no edit re-read.
  post-render  a Recast-shaped rewriter (test/fixtures/postprocessor/${PAGE_SCRIPT}): on
               CHARACTER_MESSAGE_RENDERED it waits until the round is over and the story committed the reply
               (--in-round drops that wait), then --delay ms, then rewrites chat[id].mes with the same regex
               (plus --append), calls updateMessageBlock, emits MESSAGE_EDITED unawaited and saves.
               --burst single: one rewrite. double: the same text twice back to back (Recast's two
               safeUpdateMessageText calls). late: the regexed text (plus --append-first), then the appended text --late ms later.

install defaults to the regex script only. The regex script is marker-named, so
\`so-assets.mts remove --marker ${POSTPROCESSOR_MARKER}\` also deletes it; the rewriter lives in the page until remove or a reload.`;

export interface RegexScript {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: number[];
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  runOnEdit: boolean;
  substituteRegex: number;
  minDepth: number | null;
  maxDepth: number | null;
}

export interface PostRenderOptions {
  burst: Burst;
  append: string;
  appendFirst: string;
  delayMs: number;
  lateMs: number;
  quietMs: number;
  afterCommit: boolean;
}

export interface InstallOptions {
  regex: boolean;
  postRender: PostRenderOptions | null;
}

export const readRegexScript = (path = REGEX_FIXTURE): RegexScript => JSON.parse(readFileSync(path, 'utf-8')) as RegexScript;

export function regexFromString(input: string): RegExp | null {
  const match = String(input).match(/(\/?)(.+)\1([a-z]*)/i);
  return match ? new RegExp(match[2], match[3]) : null;
}

export function applyRegexScript(script: Pick<RegexScript, 'findRegex' | 'replaceString'>, text: string): string {
  const find = regexFromString(script.findRegex);
  return find ? text.replace(find, script.replaceString) : text;
}

export function postRenderTexts(script: Pick<RegexScript, 'findRegex' | 'replaceString'>, text: string, burst: Burst, append = '', appendFirst = ''): string[] {
  const polished = applyRegexScript(script, text);
  const final = append ? `${polished.trimEnd()} ${append}` : polished;
  const first = appendFirst ? `${polished.trimEnd()} ${appendFirst}` : polished;
  return burst === 'double' ? [final, final] : burst === 'late' ? [first, final] : [final];
}

const valueOf = (args: string[], flag: string): string | null => {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
};

const numberOf = (args: string[], flag: string, fallback: number): number => {
  const raw = valueOf(args, flag);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} takes a number of milliseconds, got "${raw}"`);
  return value;
};

export function parseInstallArgs(args: string[]): InstallOptions {
  const burst = (valueOf(args, '--burst') ?? 'single') as Burst;
  if (!BURSTS.includes(burst)) throw new Error(`--burst takes ${BURSTS.join(', ')}, got "${burst}"`);
  const postRender = args.includes('--post-render') || args.includes('--burst') || args.includes('--append');
  return {
    regex: !args.includes('--no-regex'),
    postRender: postRender ? {
      burst,
      append: valueOf(args, '--append') ?? '',
      appendFirst: valueOf(args, '--append-first') ?? '',
      delayMs: numberOf(args, '--delay', 500),
      lateMs: numberOf(args, '--late', 1500),
      quietMs: numberOf(args, '--quiet', 1000),
      afterCommit: !args.includes('--in-round'),
    } : null,
  };
}

export async function injectPostProcessor(page: Pick<Page, 'evaluate'>) {
  return injectScript(page as Page, PAGE_SCRIPT, POSTPROCESSOR_DIR);
}

export async function installPostProcessor(page: Pick<Page, 'evaluate'>, options: InstallOptions, save: (page: Pick<Page, 'evaluate'>) => Promise<unknown> = (target) => saveSettingsNow(target)) {
  if (!options.regex && !options.postRender) return { ok: false, error: 'nothing to install: --no-regex without --post-render' };
  const script = readRegexScript();
  await injectPostProcessor(page);
  const regex = options.regex ? await evaluateInST(page as Page, (entry: RegexScript) => (globalThis as any).__soPostProcessor.installRegex(entry), script) : null;
  if (regex) await save(page);
  const postRender = options.postRender
    ? await evaluateInST(page as Page, (config: Record<string, unknown>) => (globalThis as any).__soPostProcessor.arm(config), { findRegex: script.findRegex, replaceString: script.replaceString, ...options.postRender })
    : null;
  return { ok: true, regex, postRender };
}

export async function removePostProcessor(page: Pick<Page, 'evaluate'>, save: (page: Pick<Page, 'evaluate'>) => Promise<unknown> = (target) => saveSettingsNow(target)) {
  const result = await evaluateInST(page as Page, (prefix: string) => {
    const g = globalThis as any;
    const disarmed = g.__soPostProcessor ? g.__soPostProcessor.disarm().disarmed : false;
    delete g.__soPostProcessor;
    const ctx = g.SillyTavern.getContext();
    const list = Array.isArray(ctx.extensionSettings?.regex) ? ctx.extensionSettings.regex : [];
    const marked = (entry: any) => String(entry?.scriptName ?? '').toLowerCase().startsWith(prefix.toLowerCase());
    const removed = list.filter(marked).map((entry: any) => entry.scriptName);
    if (removed.length) ctx.extensionSettings.regex = list.filter((entry: any) => !marked(entry));
    return { disarmed, removed };
  }, POSTPROCESSOR_MARKER);
  if (result.removed.length) await save(page);
  return { ok: true, ...result };
}

export async function postProcessorStatus(page: Pick<Page, 'evaluate'>) {
  return evaluateInST(page as Page, (prefix: string) => {
    const g = globalThis as any;
    const ctx = g.SillyTavern.getContext();
    const list = Array.isArray(ctx.extensionSettings?.regex) ? ctx.extensionSettings.regex : [];
    const regex = list.filter((entry: any) => String(entry?.scriptName ?? '').toLowerCase().startsWith(prefix.toLowerCase()))
      .map((entry: any) => ({ id: entry.id, scriptName: entry.scriptName, disabled: Boolean(entry.disabled), placement: entry.placement }));
    return { ok: true, regex, postRender: g.__soPostProcessor ? { rewrites: g.__soPostProcessor.rewrites.slice() } : null };
  }, POSTPROCESSOR_MARKER);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verb = process.argv[2];
  if (!verb || hasHelpFlag() || !['install', 'remove', 'status'].includes(verb)) {
    console.log(USAGE);
    process.exit(verb && !hasHelpFlag() ? 1 : 0);
  }
  const options = verb === 'install' ? parseInstallArgs(process.argv.slice(3)) : null;
  runCli(async (page) => {
    const result: { ok?: boolean } = verb === 'install' ? await installPostProcessor(page, options as InstallOptions) : verb === 'remove' ? await removePostProcessor(page) : await postProcessorStatus(page);
    console.log(JSON.stringify(result, null, 2));
    return result;
  });
}
