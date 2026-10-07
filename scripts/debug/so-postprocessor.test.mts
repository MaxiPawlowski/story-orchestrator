import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRegexScript, installPostProcessor, parseInstallArgs, postProcessorStatus, postRenderTexts, readRegexScript, removePostProcessor, POSTPROCESSOR_MARKER } from './so-postprocessor.mts';
import { validateFixture } from './lib/scenarioSchema.mts';
import { requiresOf } from './lib/scenarioRequires.mts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCENARIO = join(ROOT, 'test', 'scenarios', 'v27-33-v3-postprocessor.json');
const g = globalThis as any;
const fakePage = { evaluate: async (fn: any, arg: any) => fn(arg) } as any;
const noSave = async () => undefined;

interface Row { name: string; is_user: boolean; mes: string; swipes?: string[]; swipe_id?: number; send_date?: string }

let log: string[];
let listeners: Map<string, Array<(...args: unknown[]) => unknown>>;
let chat: Row[];
let engineLast: number;
let settingsSaves: number;

beforeEach(() => {
  log = [];
  listeners = new Map();
  chat = [{ name: 'Player', is_user: true, mes: 'hello', send_date: 't0' }];
  engineLast = -1;
  settingsSaves = 0;
  const ctx = {
    chat,
    extensionSettings: { regex: [{ id: 'mine', scriptName: 'My regex' }] as any[] },
    eventTypes: { CHARACTER_MESSAGE_RENDERED: 'character_message_rendered', MESSAGE_EDITED: 'message_edited' },
    eventSource: {
      on: (name: string, fn: any) => { listeners.set(name, [...(listeners.get(name) ?? []), fn]); },
      removeListener: (name: string, fn: any) => { listeners.set(name, (listeners.get(name) ?? []).filter((entry) => entry !== fn)); },
      emit: (name: string, ...args: unknown[]) => {
        log.push(`${name}:${String(args[0])}:${chat[Number(args[0])]?.mes ?? ''}`);
        for (const fn of listeners.get(name) ?? []) fn(...args);
        return Promise.resolve();
      },
    },
    updateMessageBlock: (id: number) => { log.push(`render:${id}`); },
    saveChat: async () => { log.push('save'); },
  };
  g.SillyTavern = { getContext: () => ctx };
  g.storyOrchestratorRuntime = { getEngineState: () => ({ lastMessageId: engineLast, activeCheckpointId: 'hall' }) };
});

afterEach(() => {
  g.__soPostProcessor?.disarm();
  delete g.__soPostProcessor;
  delete g.SillyTavern;
  delete g.storyOrchestratorRuntime;
});

const reply = (mes: string) => {
  chat.push({ name: 'DM Narrator', is_user: false, mes, swipes: [mes], swipe_id: 0, send_date: `t${chat.length}` });
  return chat.length - 1;
};

const fast = { delayMs: 0, lateMs: 20, quietMs: 0, afterCommit: true, appendFirst: '' };

test('the reference script is a global AI-output Regex script that alters the chat, marker-named for so-assets cleanup', () => {
  const script = readRegexScript();
  assert.ok(script.scriptName.startsWith(POSTPROCESSOR_MARKER));
  assert.deepEqual(script.placement, [2]);
  assert.equal(script.markdownOnly, false);
  assert.equal(script.promptOnly, false);
  assert.equal(script.disabled, false);
  assert.equal(applyRegexScript(script, 'She says "come in" and "sit".'), 'She says “come in” and “sit”.');
  assert.equal(applyRegexScript(script, 'No dialogue here.'), 'No dialogue here.');
});

test('the burst shapes: single writes once, double writes the same text twice, late writes the first text then the appended one', () => {
  const script = readRegexScript();
  assert.deepEqual(postRenderTexts(script, 'He says "go".', 'single', 'The key is yours.'), ['He says “go”. The key is yours.']);
  assert.deepEqual(postRenderTexts(script, 'He says "go".', 'double', 'The key is yours.'), ['He says “go”. The key is yours.', 'He says “go”. The key is yours.']);
  assert.deepEqual(postRenderTexts(script, 'He says "go".', 'late', 'You enter.', 'You walk up.'), ['He says “go”. You walk up.', 'He says “go”. You enter.']);
});

test('install arguments: the regex script alone by default, the rewriter on request, an unknown burst refused', () => {
  assert.deepEqual(parseInstallArgs([]), { regex: true, postRender: null });
  const late = parseInstallArgs(['--no-regex', '--burst', 'late', '--append', 'x', '--late', '2000', '--in-round']);
  assert.equal(late.regex, false);
  assert.deepEqual(late.postRender, { burst: 'late', append: 'x', appendFirst: '', delayMs: 500, lateMs: 2000, quietMs: 1000, afterCommit: false });
  assert.throws(() => parseInstallArgs(['--burst', 'triple']), /--burst takes single, double, late/);
  assert.throws(() => parseInstallArgs(['--post-render', '--delay', '-1']), /--delay takes a number/);
});

test('install adds the marker-named script once and saves; remove deletes only marker-named scripts and disarms the rewriter', async () => {
  const saved = async () => { settingsSaves += 1; };
  const first = await installPostProcessor(fakePage, { regex: true, postRender: null }, saved) as any;
  const second = await installPostProcessor(fakePage, { regex: true, postRender: null }, saved) as any;
  assert.equal(first.regex.installed, true);
  assert.equal(second.regex.installed, false);
  const names = () => g.SillyTavern.getContext().extensionSettings.regex.map((entry: any) => entry.scriptName);
  assert.deepEqual(names(), ['My regex', readRegexScript().scriptName]);
  assert.equal(settingsSaves, 2);
  const status = await postProcessorStatus(fakePage) as any;
  assert.equal(status.regex.length, 1);
  const removed = await removePostProcessor(fakePage, saved) as any;
  assert.deepEqual(removed.removed, [readRegexScript().scriptName]);
  assert.deepEqual(names(), ['My regex']);
  assert.equal(g.__soPostProcessor, undefined);
  assert.equal((await removePostProcessor(fakePage, saved) as any).removed.length, 0);
  assert.equal(settingsSaves, 3);
});

test('the post-render rewriter waits for the story to commit the reply, then rewrites, emits MESSAGE_EDITED and saves', async () => {
  await installPostProcessor(fakePage, { regex: false, postRender: { burst: 'single', append: 'The key is yours.', ...fast } }, noSave);
  const id = reply('He says "go".');
  await g.SillyTavern.getContext().eventSource.emit('character_message_rendered', id, 'normal');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(chat[id].mes, 'He says "go".');
  engineLast = id;
  const [entry] = await g.__soPostProcessor.settled();
  assert.equal(entry.committedBefore, true);
  assert.equal(entry.changed, true);
  assert.equal(chat[id].mes, 'He says “go”. The key is yours.');
  assert.deepEqual(chat[id].swipes, [chat[id].mes]);
  assert.deepEqual(log.slice(1), [`render:${id}`, `message_edited:${id}:${chat[id].mes}`, 'save']);
});

test('double and late bursts emit the events a Recast-shaped post-processor emits', async () => {
  await installPostProcessor(fakePage, { regex: false, postRender: { burst: 'double', append: 'Open.', ...fast } }, noSave);
  engineLast = 10;
  const double = reply('"Wait."');
  await g.SillyTavern.getContext().eventSource.emit('character_message_rendered', double, 'normal');
  await g.__soPostProcessor.settled();
  assert.deepEqual(log.filter((line) => !line.startsWith('character')), [`render:${double}`, `message_edited:${double}:“Wait.” Open.`, `render:${double}`, `message_edited:${double}:“Wait.” Open.`, 'save']);
  log.length = 0;
  await installPostProcessor(fakePage, { regex: false, postRender: { burst: 'late', append: 'In.', ...fast, appendFirst: 'Near.' } }, noSave);
  const late = reply('"Look."');
  await g.SillyTavern.getContext().eventSource.emit('character_message_rendered', late, 'normal');
  const rewrites = await g.__soPostProcessor.settled();
  assert.deepEqual(log.filter((line) => !line.startsWith('character')), [`render:${late}`, `message_edited:${late}:“Look.” Near.`, 'save', `render:${late}`, `message_edited:${late}:“Look.” In.`, 'save']);
  assert.ok(rewrites[rewrites.length - 1].settledAt - rewrites[rewrites.length - 1].armedAt >= 20);
});

test('greetings, user rows and a reply that is no longer the newest are never rewritten', async () => {
  await installPostProcessor(fakePage, { regex: false, postRender: { burst: 'single', append: 'X.', ...fast } }, noSave);
  engineLast = 10;
  const greeting = reply('"Hi."');
  await g.SillyTavern.getContext().eventSource.emit('character_message_rendered', greeting, 'first_message');
  const older = reply('"One."');
  await g.SillyTavern.getContext().eventSource.emit('character_message_rendered', older, 'normal');
  reply('"Two."');
  const rewrites = await g.__soPostProcessor.settled();
  assert.equal(chat[greeting].mes, '"Hi."');
  assert.equal(chat[older].mes, '"One."');
  assert.deepEqual(rewrites.map((entry: any) => entry.skipped), ['no longer the newest reply']);
});

test('the V3 scenario: closed vocabulary, the toy group by name, a model lane, and the inline script equal to the fixture', () => {
  const doc = JSON.parse(readFileSync(SCENARIO, 'utf-8'));
  assert.deepEqual(validateFixture(doc, 'v27-33-v3-postprocessor.json'), []);
  assert.deepEqual(requiresOf(doc), { lane: 'model', group: 'Group: Arin, DM Narrator', members: ['Arin', 'DM Narrator'], why: requiresOf(doc).why });
  const script = readRegexScript();
  const evals: string[] = doc.steps.filter((step: any) => typeof step.eval === 'string').map((step: any) => step.eval);
  const install = evals.find((text) => text.includes('installRegex('));
  assert.ok(install);
  const inline = JSON.parse(install.slice(install.indexOf('const script = ') + 'const script = '.length, install.indexOf('; const installed')));
  assert.deepEqual(inline, script);
  const armed = evals.filter((text) => text.includes('.arm(')).map((text) => JSON.parse(text.slice(text.indexOf('.arm(') + 5, text.indexOf('); globalThis.__v3.cases'))));
  assert.deepEqual(armed.map((config) => config.burst), ['single', 'double', 'late']);
  for (const config of armed) assert.deepEqual([config.findRegex, config.replaceString, config.afterCommit], [script.findRegex, script.replaceString, true]);
  assert.ok(doc.steps.some((step: any) => step.inject_script === '../fixtures/postprocessor/so-v3-postprocessor.js'));
  assert.match(doc.objective, /NOT RUN/);
});
