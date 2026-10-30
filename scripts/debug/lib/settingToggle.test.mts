import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleSetting } from './settingToggle.mts';

const page = { evaluate: async <A, R>(fn: (arg: A) => R, arg: A) => fn(arg) };

const switchElement = (on: boolean, disabled = false) => {
  const attrs: Record<string, string> = { role: 'switch', 'aria-checked': String(on) };
  const clicks: string[] = [];
  const element = {
    tagName: 'BUTTON', disabled, clicks,
    getAttribute: (name: string) => attrs[name] ?? null,
    closest: () => null,
    click: () => { clicks.push('switch'); attrs['aria-checked'] = String(attrs['aria-checked'] !== 'true'); },
  };
  return element;
};

const checkboxElement = (on: boolean) => {
  const clicks: string[] = [];
  const element = {
    tagName: 'INPUT', type: 'checkbox', checked: on, disabled: false, clicks,
    getAttribute: () => null,
    closest: (selector: string) => (selector === 'label' ? { click: () => { clicks.push('label'); element.checked = !element.checked; } } : null),
    click: () => { clicks.push('input'); element.checked = !element.checked; },
  };
  return element;
};

const withDocument = (elements: Record<string, unknown>) => {
  (globalThis as Record<string, unknown>).document = { querySelector: (selector: string) => elements[selector] ?? null };
};

test('a role=switch setting is clicked on the button and read back from aria-checked', async () => {
  const element = switchElement(false);
  withDocument({ '#so-judge-enabled': element });
  const result = await toggleSetting(page, '#so-judge-enabled', true);
  assert.deepEqual({ ok: result.ok, kind: result.kind, on: result.on, clicked: result.clicked }, { ok: true, kind: 'switch', on: true, clicked: true });
  assert.deepEqual(element.clicks, ['switch']);
});

test('a checkbox setting is clicked through its label, never the input (that toggles twice)', async () => {
  const element = checkboxElement(true);
  withDocument({ '#so-old-box': element });
  const result = await toggleSetting(page, '#so-old-box', false);
  assert.deepEqual({ ok: result.ok, kind: result.kind, on: result.on }, { ok: true, kind: 'checkbox', on: false });
  assert.deepEqual(element.clicks, ['label']);
});

test('controls: a setting already in the asked state is not clicked; missing, disabled and non-toggle targets fail', async () => {
  const on = switchElement(true);
  const off = switchElement(false, true);
  const plain = { tagName: 'DIV', getAttribute: () => null, closest: () => null, click: () => undefined };
  withDocument({ '#on': on, '#locked': off, '#plain': plain });
  const same = await toggleSetting(page, '#on', true);
  assert.equal(same.ok, true);
  assert.equal(same.clicked, false);
  assert.deepEqual(on.clicks, []);
  assert.match((await toggleSetting(page, '#missing', true)).reason ?? '', /no element/);
  const locked = await toggleSetting(page, '#locked', true);
  assert.equal(locked.ok, false);
  assert.match(locked.reason ?? '', /disabled/);
  assert.deepEqual(off.clicks, []);
  assert.match((await toggleSetting(page, '#plain', true)).reason ?? '', /neither a role=switch nor a checkbox/);
});
