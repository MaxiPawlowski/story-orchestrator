// v2.4 plan 01 (T20): every event name src/ subscribes to must be a key or a value of ST's own
// `event_types`. `subscribeToHostEvent` resolves `eventTypes[name] ?? name`, so a misspelled key is
// subscribed verbatim, never fires, and nothing fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const ST_ROOT = process.env.ST_ROOT ? resolve(process.env.ST_ROOT) : resolve(ROOT, '../../../../..');
const EVENTS_JS = join(ST_ROOT, 'public', 'scripts', 'events.js');

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return sources(path);
  return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.stories\.tsx$/.test(name) ? [path] : [];
});

export function subscribedNames(files: string[]): Array<{ name: string; file: string }> {
  const found: Array<{ name: string; file: string }> = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    for (const match of text.matchAll(/eventName:\s*["']([A-Za-z_]+)["']/g)) found.push({ name: match[1], file });
    for (const match of text.matchAll(/subscribeToHostEvent\(\s*["']([A-Za-z_]+)["']/g)) found.push({ name: match[1], file });
    for (const match of text.matchAll(/_EVENT\s*=\s*["']([a-z_]+)["']/g)) found.push({ name: match[1], file });
  }
  return found;
}

export function hostEventTypes(eventsJs: string): Map<string, string> {
  const block = eventsJs.slice(eventsJs.indexOf('export const event_types'));
  const body = block.slice(0, block.indexOf('};'));
  return new Map([...body.matchAll(/^\s*([A-Z0-9_]+):\s*'([a-z0-9_]+)'/gm)].map((match) => [match[1], match[2]]));
}

test('every event name src/ subscribes to is a key or a value of ST event_types', (t) => {
  if (!existsSync(EVENTS_JS)) {
    t.skip(`blocked: no SillyTavern checkout at ${ST_ROOT} (set ST_ROOT)`);
    return;
  }
  const types = hostEventTypes(readFileSync(EVENTS_JS, 'utf-8'));
  assert.ok(types.size > 50, `parsed only ${types.size} event types from ${EVENTS_JS}`);
  const values = new Set(types.values());
  const names = subscribedNames(sources(join(ROOT, 'src')));
  assert.ok(names.length >= 15, `found only ${names.length} subscriptions; the scan is not seeing the code`);
  const unknown = names.filter(({ name }) => !types.has(name) && !values.has(name));
  assert.deepEqual(unknown, []);
});

test('control: a misspelled key is caught, a real key and a real value pass', () => {
  const types = hostEventTypes("export const event_types = {\n    CHAT_CHANGED: 'chat_id_changed',\n    MESSAGE_SENT: 'message_sent',\n};");
  const values = new Set(types.values());
  const check = (name: string) => types.has(name) || values.has(name);
  assert.equal(check('CHAT_CHANGED'), true);
  assert.equal(check('message_sent'), true);
  assert.equal(check('CHAT_CHANGE'), false);
});
