// The reconciliation queue verb (v2.3 plan 05) is driven by a selector string built from an action,
// a conflict key, a side index and a row index. A wrong selector fails the SAME way a right one does
// when the panel is empty — "nothing matched" — so the failure would be attributed to the queue
// rather than to the tool. The builder is pure and asserted here; the DOM half is exercised only in
// a live gate, which had not run when this was written.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_TEXT_SURFACES, assertPlayerClean } from './so-ui.mts';
import { attributeFindings, surfaceTextFindings, assignedRoleProfiles, branchContinue, closeCharacterPanel, switchDrawerTab, gateReplayHistoryFrom, INLINE_PLAYER_FORBIDDEN_SELECTORS, inlineTextFindings, jumpToCitation, memoryQueueSelector, PLAYER_FORBIDDEN_SELECTORS, PLAYER_RECOVERY_CONTROLS, recoveryControlFindings, errorStateFindings } from './so-ui.mts';

test('keep and lock address the side row inside the named pair', () => {
  assert.equal(memoryQueueSelector({ action: 'keep', key: 'fact:abc' }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-keep"] >> nth=0');
  assert.equal(memoryQueueSelector({ action: 'keep', key: 'fact:abc', side: 1 }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-keep"] >> nth=1');
  assert.equal(memoryQueueSelector({ action: 'lock', key: 'fact:abc' }), '[data-so="conflict-pair"][data-key="fact:abc"] [data-so="conflict-lock"] >> nth=0');
});

test('reread and dismiss address the pair, not a side', () => {
  const reread = memoryQueueSelector({ action: 'reread', key: 'scene:x' });
  assert.equal(reread, '[data-so="conflict-pair"][data-key="scene:x"] [data-so="conflict-reread"]');
  assert.ok(!reread.includes('nth='), 'a pair-level action must not be narrowed to one side');
});

test('reconfirm and discard address the quarantined list by row', () => {
  assert.equal(memoryQueueSelector({ action: 'reconfirm', index: 0 }), '[data-so="quarantined"] >> nth=0 >> [data-so="reconfirm"]');
  assert.equal(memoryQueueSelector({ action: 'discard', index: 2 }), '[data-so="quarantined"] >> nth=2 >> [data-so="discard-quarantined"]');
});

test('a pair action without a key, and an unknown action, are refused rather than guessed', () => {
  assert.throws(() => memoryQueueSelector({ action: 'keep' }), /needs a conflict key/);
  assert.throws(() => memoryQueueSelector({ action: 'lock' }), /needs a conflict key/);
  assert.throws(() => memoryQueueSelector({ action: 'nuke' }), /unknown memory-queue action/);
  // reconfirm/discard take no key, so a missing key must NOT be an error for them.
  assert.ok(memoryQueueSelector({ action: 'reconfirm' }).includes('reconfirm'));
});

const classList = (initial: string[]) => {
  const set = new Set(initial);
  return { contains: (name: string) => set.has(name), replace: (from: string, to: string) => { if (!set.has(from)) return false; set.delete(from); set.add(to); return true; }, has: (name: string) => set.has(name) };
};

const fakeDom = (open: boolean, pinned: boolean) => {
  const panel = { classList: classList([open ? 'openDrawer' : 'closedDrawer']) };
  const icon = { classList: classList([open ? 'openIcon' : 'closedIcon']) };
  const pin = { checked: pinned };
  (globalThis as any).document = { getElementById: (id: string) => ({ 'right-nav-panel': panel, rightNavDrawerIcon: icon, rm_button_panel_pin: pin } as Record<string, unknown>)[id] ?? null };
  return { panel, icon };
};

const fakePage = { evaluate: (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg) } as never;

test('an open, unpinned Character Management panel is closed before a drawer tab is clicked', async () => {
  const { panel, icon } = fakeDom(true, false);
  assert.deepEqual(await closeCharacterPanel(fakePage), { closed: true, pinned: false });
  assert.ok(panel.classList.has('closedDrawer') && icon.classList.has('closedIcon'));
});

test("control: a pinned panel is the author's choice and stays open; a closed one is left alone", async () => {
  const pinned = fakeDom(true, true);
  assert.deepEqual(await closeCharacterPanel(fakePage), { closed: false, pinned: true });
  assert.ok(pinned.panel.classList.has('openDrawer'));
  fakeDom(false, false);
  assert.deepEqual(await closeCharacterPanel(fakePage), { closed: false, pinned: false });
  delete (globalThis as any).document;
});

test('T3-4 harness: drawer-tab opens the story drawer itself before it looks for the tab (a turn closes it)', async () => {
  fakeDom(false, false);
  const calls: string[] = [];
  const drawerState = { open: false };
  const tab = { count: async () => (drawerState.open ? 1 : 0), first: () => ({ click: async () => { calls.push('click'); }, getAttribute: async () => 'true' }) };
  const page = {
    evaluate: (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg),
    locator: () => ({ count: async () => 1, locator: () => tab }),
  } as never;
  const result = await switchDrawerTab(page, 'Memory', { open: async () => { calls.push('open'); drawerState.open = true; } });
  assert.deepEqual([calls, result], [['open', 'click'], { tab: 'Memory', selected: true }]);
  delete (globalThis as any).document;
});

// v2.4 plan 02 §10: the branch-continue verb, against a DOM that has the notice, one that covers it, and
// one without it (every build before plan 02 §5, where it must fail as `missing`, not pass).
const branchDom = ({ present, covered = false, clearsOnClick = true }: { present: boolean; covered?: boolean; clearsOnClick?: boolean }) => {
  const state = { notice: present, clicks: [] as Array<[number, number]> };
  const target = { id: 'so-branch-continue', tagName: 'BUTTON', className: 'menu_button', disabled: false, getAttribute: () => null, getBoundingClientRect: () => ({ left: 100, top: 40, width: 80, height: 20 }), contains: (node: unknown) => node === target };
  const overlay = { id: 'shadow', tagName: 'DIV', className: '', contains: () => false };
  (globalThis as any).window = { innerWidth: 1280, innerHeight: 800 };
  (globalThis as any).getComputedStyle = () => ({ pointerEvents: 'auto' });
  (globalThis as any).document = {
    querySelector: (selector: string) => (state.notice && (selector === '#so-branch-continue' || selector === '#so-branch-notice') ? target : null),
    elementFromPoint: () => (covered ? overlay : target),
  };
  const page = {
    evaluate: (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg),
    mouse: { click: async (x: number, y: number) => { state.clicks.push([x, y]); if (clearsOnClick) state.notice = false; } },
  } as never;
  return { state, page };
};
const noPrepare = async () => undefined;
const cleanDom = () => { for (const key of ['window', 'getComputedStyle', 'document']) delete (globalThis as any)[key]; };

test('branch-continue lands a pointer on the control centre and waits for the notice to go', async () => {
  const { state, page } = branchDom({ present: true });
  const result = await branchContinue(page, { prepare: noPrepare, timeoutMs: 100, pollMs: 5 });
  assert.deepEqual(state.clicks, [[140, 50]]);
  assert.equal(result.noticeGone, true);
  cleanDom();
});

test('branch-continue fails clearly as missing when no notice exists (today: plan 02 §5 is not built)', async () => {
  const { state, page } = branchDom({ present: false });
  await assert.rejects(branchContinue(page, { prepare: async () => { throw new Error('Drawer tab "Overview" not found.'); }, timeoutMs: 50, pollMs: 5 }), /#so-branch-continue is not clickable by a pointer \(missing\).*no branch notice is showing.*Overview" not found/);
  assert.deepEqual(state.clicks, []);
  cleanDom();
});

test('control: a covered control is refused without a click, and a click that leaves the notice up fails', async () => {
  const covered = branchDom({ present: true, covered: true });
  await assert.rejects(branchContinue(covered.page, { prepare: noPrepare, timeoutMs: 50, pollMs: 5 }), /\(overlay\)/);
  assert.deepEqual(covered.state.clicks, []);
  const stuck = branchDom({ present: true, clearsOnClick: false });
  await assert.rejects(branchContinue(stuck.page, { prepare: noPrepare, timeoutMs: 30, pollMs: 5 }), /was still showing after 30 ms/);
  assert.equal(stuck.state.clicks.length, 1);
  cleanDom();
});

test('the player-clean sweep covers both recovery controls, and passes their player copy', () => {
  assert.deepEqual(PLAYER_RECOVERY_CONTROLS, ['#so-pipeline-retry', '#so-memorize-stop']);
  assert.deepEqual(recoveryControlFindings([{ selector: '#so-pipeline-retry', text: 'Try again' }, { selector: '#so-memorize-stop', text: 'Stop' }]), []);
});

test('player copy with no raw error text passes the error-state sweep', () => {
  const texts = [
    { tab: 'Overview', surface: '#drawer-manager', text: 'Where you are: The Ruins. Catching up on the last two replies.' },
    { tab: 'Overview', surface: '#so-hud', text: 'The Ruins · tense' },
    { tab: 'Overview', surface: '#story-orchestrator-settings', text: 'Expansion merge failed; the story plays its authored graph' },
  ];
  assert.deepEqual(errorStateFindings(texts), []);
});

test('raw error text on a player surface is a finding, named by marker', () => {
  const findings = errorStateFindings([
    { tab: 'Overview', surface: '#drawer-manager', text: "Status: TypeError: Cannot read properties of undefined (reading 'id')" },
    { tab: 'Memory', surface: '#so-hud', text: 'tension NaN · [object Object]' },
    { tab: 'Overview', surface: '#story-orchestrator-settings', text: 'failed\n    at runPass (http://127.0.0.1:8000/x.js:1:2)' },
  ]);
  const names = findings.map((finding) => finding.needle);
  assert.ok(names.some((needle) => needle.includes('(error class)')));
  assert.ok(names.some((needle) => needle.includes('(property access failure)')));
  assert.ok(names.some((needle) => needle.includes('(unrendered value)') && needle.startsWith('#so-hud')));
  assert.ok(names.some((needle) => needle.includes('(stack frame)')));
  assert.deepEqual([...new Set(findings.map((finding) => finding.tab))].sort(), ['Memory', 'Overview']);
});

test('a recovery control whose label leaks internals is a finding', () => {
  const findings = recoveryControlFindings([{ selector: '#so-pipeline-retry', text: 'Retry profile artemis (API error)' }]);
  assert.ok(findings.some((finding) => finding.needle.includes('"profile"')));
  assert.ok(findings.some((finding) => finding.needle.includes('"API"')));
  assert.ok(findings.every((finding) => finding.needle.startsWith('#so-pipeline-retry')));
});

// v2.4 plan 08: the author-grade surfaces this plan added stay out of player mode, and the role pinning
// names a routed profile the panel no longer offers.
test('the player-clean sweep forbids the plan 08 author surfaces', () => {
  for (const selector of ['[data-so="next-turn-cost"]', '[data-so="next-turn-tokens"]', '[data-so="next-turn-trim"]', '[data-so="next-turn-foreign"]', '[data-so="next-turn-foreign-row"]', '[data-so="memory-fate"]', '[data-so="jump-to-message"]']) {
    assert.ok(PLAYER_FORBIDDEN_SELECTORS.includes(selector), selector);
  }
});

test('assigned role profiles resolve to the offered label, and a dangling id reads as null', async () => {
  (globalThis as any).SillyTavern = { getContext: () => ({ extensionSettings: { 'story-orchestrator': { settings: { extraction: { profiles: { director: 'fast', curator: 'gone' } } } } } }) };
  (globalThis as any).document = { querySelectorAll: () => [{ value: 'memory', textContent: ' Memory RunPod ' }, { value: 'fast', textContent: 'Fast local' }] };
  assert.deepEqual(await assignedRoleProfiles(fakePage), { director: { id: 'fast', label: 'Fast local' }, curator: { id: 'gone', label: null } });
  (globalThis as any).SillyTavern = { getContext: () => ({ extensionSettings: {} }) };
  assert.deepEqual(await assignedRoleProfiles(fakePage), {});
  delete (globalThis as any).SillyTavern;
  delete (globalThis as any).document;
});

test('jump refuses when no citation matches instead of clicking nothing', async () => {
  const page = { locator: () => ({ nth: () => ({ count: async () => 0 }) }) } as never;
  await assert.rejects(jumpToCitation(page, {}), /no citation matched \[data-so="jump-to-message"\] \(index 0\)/);
});

test('v2.5 plan 07: the player-clean sweep forbids the author tools (gate replay, calls, buckets, inspector)', () => {
  for (const selector of ['[data-so="gate-replay"]', '[data-so="model-calls"]', '[data-so="model-call"]', '[data-so="next-turn-buckets"]', '#so-inspector']) {
    assert.ok(PLAYER_FORBIDDEN_SELECTORS.includes(selector), selector);
  }
});

test('v2.7 plan 06: the player-clean sweep forbids the Activity panel and roll chips, and reads the presence surfaces', () => {
  for (const selector of ['#so-open-activity', '#so-panel-activity', '[data-so="activity"]', '#so-presence-roll-chips', '[data-so="roll-chip"]']) {
    assert.ok(PLAYER_FORBIDDEN_SELECTORS.includes(selector), selector);
  }
  for (const selector of ['[data-so="roll-chips"]', '[data-so="roll-chip"]']) assert.ok(INLINE_PLAYER_FORBIDDEN_SELECTORS.includes(selector), selector);
  for (const surface of ['#so-panels-root', '#so-continue-list', '#chat [data-so="chapter-card"]', '#extensionsMenu [data-so="story-wand"]', '.so-story-badge', '.so-story-card']) {
    assert.ok(PLAYER_TEXT_SURFACES.includes(surface), surface);
  }
});

test('v2.5 plan 08 L2: the player-clean sweep forbids the lore-binding rows (the Repair step is the player half)', () => {
  for (const selector of ['[data-so="lore-satisfied-by"]', '[data-so="lore-character-gap"]', '[data-so="mirror-slot-conflict"]']) {
    assert.ok(PLAYER_FORBIDDEN_SELECTORS.includes(selector), selector);
  }
});

test('v2.5 plan 07 A3: the replay history is the selected story record of the chat blob, pinned story and engine history together', () => {
  const record = { storyId: 's1', pinnedStory: { title: 'S' }, engineHistory: { from: { boundary: 0, messageId: -1 }, base: {}, log: [{ boundary: 1 }] } };
  assert.deepEqual(gateReplayHistoryFrom({ selectedStoryId: 's1', stories: { s1: record, s2: { storyId: 's2' } } }), { storyId: 's1', pinnedStory: record.pinnedStory, engineHistory: record.engineHistory });
  assert.equal(gateReplayHistoryFrom({ selectedStoryId: 's2', stories: { s2: { storyId: 's2' } } }), null);
  assert.equal(gateReplayHistoryFrom(null), null);
});

test('v2.6 plan 08: the inline sweep forbids the author half and flags a leak in player copy', () => {
  for (const selector of ['[data-so="inline-inspect"]', '[data-so="inline-action"]', '[data-so="inline-item-detail"]', '[data-so="inline-item"][data-level="3"]']) {
    assert.ok(INLINE_PLAYER_FORBIDDEN_SELECTORS.includes(selector), selector);
  }
  assert.deepEqual(inlineTextFindings([{ mesid: '4', text: 'Remembered: the map points east.\nLore consulted: 4 entries' }]), []);
  const leaks = inlineTextFindings([{ mesid: '5', text: 'boundary 3 applied\nError: boom' }]);
  assert.ok(leaks.some((finding) => finding.needle === 'boundary '));
  assert.ok(leaks.some((finding) => finding.needle.includes('raw error text')));
});

test('CR-U: the player-clean sweep forbids every v2.6 author surface and no longer lists the stale .so-inspect', () => {
  for (const selector of ['#so-inline-level option[value="3"]', '#so-inline-level option[value="4"]', '#so-chapter-seal', '#so-chapter-fold', '#so-chapter-story-so-far',
    '#so-chapter-budget', '#so-chapters', '[data-so^="chapter-"]', '#so-inner-harvest-idle', '[data-so="model-call-route"]', '[data-so="model-call-result"]',
    '[data-so="role-profile-detail"]', '#so-next-turn', '[data-so^="next-turn-"]', '[data-so="payload-folded"]', '[data-so="memory-lock"]', '[data-so^="conflict-"]',
    '[data-so="quarantined"]', '[data-so="effect-ledger"]', '#so-lore-fired', '[data-so="lore-lost"]', '[data-so="lore-constant-missed"]', '#so-scan-gate',
    '[data-so^="warden-"]', '[data-so^="driver-"]', '[data-so="expansion-regenerate"]', '[data-so="curator-diff"]', '[data-so="curator-text"]', '[data-so="curator-last-pass"]']) {
    assert.ok(PLAYER_FORBIDDEN_SELECTORS.includes(selector), selector);
  }
  assert.ok(!PLAYER_FORBIDDEN_SELECTORS.includes('.so-inspect'));
});

test('CR-U: title and aria-label values are swept for needles and raw errors on every player surface', () => {
  const clean = attributeFindings([{ tab: 'Overview', surface: '#so-hud', attr: 'title', value: 'The story stopped keeping up.' }]);
  assert.deepEqual(clean, []);
  const leaks = attributeFindings([
    { tab: 'Overview', surface: '#so-hud', attr: 'title', value: 'TypeError: x is not a function' },
    { tab: 'Overview', surface: '#story-orchestrator-settings', attr: 'aria-label', value: 'Advance to checkpoint cp2' },
  ]);
  assert.ok(leaks.some((finding) => finding.needle.includes('#so-hud [title] shows raw error text')));
  assert.ok(leaks.some((finding) => finding.needle.includes('[aria-label] carries "checkpoint"')));
});

test('CR-U: text needles run on the HUD and the settings panel too', () => {
  const findings = surfaceTextFindings([{ tab: 'Overview', surface: '#story-orchestrator-settings', text: 'World Info curator' }, { tab: 'Overview', surface: '#so-hud', text: 'The Gate' }]);
  assert.deepEqual(findings.map((finding) => finding.needle), ['#story-orchestrator-settings: World Info curator']);
});

test('T0 finding 1: player-clean fails on a raw location value or checkpoint id in the Overview', async () => {
  const { rawValueFindings, rawValueTokens } = await import('./so-ui.mts');
  const story = {
    checkpoints: [{ id: 'guild-hall' }, { id: 'driftmere' }],
    qualities: [{ type: 'enum', values: ['aegis_guild_hall', 'wendhope', 'calm'], player_labels: { wendhope: 'Wendhope village' } }, { type: 'bool' }],
  };
  const tokens = rawValueTokens(story);
  assert.deepEqual(tokens.sort(), ['aegis_guild_hall', 'guild-hall', 'wendhope']);
  const overview = (text: string) => rawValueFindings([{ tab: 'Overview', surface: '#drawer-manager', text }], tokens);
  assert.equal(overview('Where you are\nThe Adventurer\'s Guild, Aegis City\nAt aegis_guild_hall.').length, 1);
  assert.equal(overview('At north_road.').length, 1);
  assert.equal(overview('Back at guild-hall again').length, 1);
  assert.equal(overview('Rumours from wendhope').length, 1);
  assert.deepEqual(overview('Where you are\nThe Guild Hall\nAt Wendhope village. A well-known road; calm skies over Driftmere.'), []);
  assert.deepEqual(rawValueTokens(null), []);
});

test('T1 assert-player-clean: the recorded T1-2-1 surfaces read 46 findings under the old scope and none under the player scope', async () => {
  const { readFile } = await import('node:fs/promises');
  const { playerSurfaceFindings, PLAYER_CLEAN_SCOPE } = await import('./so-ui.mts');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/player-clean-t1-2-1.json', import.meta.url), 'utf-8'));
  const oldScope = playerSurfaceFindings(fixture.records, fixture.tokens, { textSurfaces: ['#drawer-manager', '#so-hud', '#story-orchestrator-settings'], exemptControls: [] });
  assert.equal(oldScope.length, fixture.sessionFindings, 'control: the old scope reproduces the session');
  assert.deepEqual(playerSurfaceFindings(fixture.records, fixture.tokens, PLAYER_CLEAN_SCOPE), []);
});

test('T1 assert-player-clean: a planted leak on a player surface still fails, and only the author-view toggle is exempt', async () => {
  const { readFile } = await import('node:fs/promises');
  const { playerSurfaceFindings } = await import('./so-ui.mts');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/player-clean-t1-2-1.json', import.meta.url), 'utf-8'));
  const plant = (mutate: (record: any) => void) => {
    const records = JSON.parse(JSON.stringify(fixture.records));
    mutate(records[0]);
    return playerSurfaceFindings(records, fixture.tokens).map((finding: { needle: string }) => finding.needle);
  };
  assert.deepEqual(plant((record) => { record.texts[1].text += '\nUnmet gates: 2'; }), ['#so-hud: Unmet gates']);
  assert.deepEqual(plant((record) => { record.texts[0].text += '\nNext: at-the-walls'; }), ['#drawer-manager shows a raw story value "at-the-walls"']);
  assert.deepEqual(plant((record) => { record.texts[0].text += '\nBlackboard'; }), ['Blackboard']);
  assert.deepEqual(plant((record) => { record.attributes.push({ surface: '#drawer-manager', attr: 'title', value: 'Show the blackboard' }); }), ['#drawer-manager [title] carries "blackboard"']);
  assert.deepEqual(plant((record) => { record.attributes.push({ surface: '#so-hud', attr: 'aria-label', value: 'Advance to the gate', controls: ['so-hud-advance'] }); }), ['#so-hud [aria-label] carries "Advance to"']);
  assert.deepEqual(plant((record) => { record.texts.push({ surface: 'dialog[open] .popup-content', text: 'Welcome back. Steering: push the caravan north.' }); }), ['dialog[open] .popup-content: Steering:']);
  assert.deepEqual(plant((record) => { record.texts[2].text += '\nTypeError: x is not a function'; }).length, 2, 'raw error text fails on every surface, the settings panel included');
  assert.deepEqual(plant((record) => { record.attributes.push({ surface: '#story-orchestrator-settings', attr: 'title', value: 'Error: profile gone' }); }), ['#story-orchestrator-settings [title] shows raw error text (error prefix)']);
});

type PlantedSpec = { tag?: string; id?: string; class?: string; attrs?: Record<string, string>; text?: string; children?: PlantedSpec[] };

const splitTopLevel = (selector: string, separator: (char: string) => boolean) => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of selector) {
    if (char === '[') depth += 1;
    if (char === ']') depth -= 1;
    if (depth === 0 && separator(char)) { if (current.trim()) parts.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const COMPOUND_TOKEN = /^(?:([a-z][a-z0-9]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:(\^?=)"([^"]*)")?\])/;

class PlantedElement {
  tag: string; id: string; classes: Set<string>; attrs: Map<string, string>; text: string; children: PlantedElement[] = []; parent: PlantedElement | null = null;
  constructor(spec: PlantedSpec) {
    this.tag = spec.tag ?? 'div';
    this.id = spec.id ?? '';
    this.classes = new Set((spec.class ?? '').split(' ').filter(Boolean));
    this.attrs = new Map(Object.entries(spec.attrs ?? {}));
    if (this.id) this.attrs.set('id', this.id);
    this.text = spec.text ?? '';
    for (const child of spec.children ?? []) { const node = new PlantedElement(child); node.parent = this; this.children.push(node); }
  }
  get classList() { return { contains: (name: string) => this.classes.has(name) }; }
  get offsetParent() { return this.parent; }
  get innerText(): string { return [this.text, ...this.children.map((child) => child.innerText)].filter(Boolean).join('\n'); }
  get textContent() { return this.innerText; }
  hasAttribute(name: string) { return this.attrs.has(name); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  click() {}
  descendants(): PlantedElement[] { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  matchesCompound(compound: string) {
    const tokens: RegExpExecArray[] = [];
    for (let rest = compound; rest;) {
      const token = COMPOUND_TOKEN.exec(rest);
      if (!token) throw new Error(`the planted DOM cannot read selector part "${rest}"`);
      tokens.push(token);
      rest = rest.slice(token[0].length);
    }
    return tokens.every(([, tag, id, cls, attr, op, value]) => {
      if (tag) return this.tag === tag;
      if (id) return this.id === id;
      if (cls) return this.classes.has(cls);
      const actual = this.attrs.get(attr);
      if (actual === undefined) return false;
      return op === '=' ? actual === value : op === '^=' ? actual.startsWith(value) : true;
    });
  }
  matches(selector: string): boolean {
    return splitTopLevel(selector, (char) => char === ',').some((alternative) => {
      const parts = splitTopLevel(alternative, (char) => /\s/.test(char));
      if (!this.matchesCompound(parts[parts.length - 1])) return false;
      let at = parts.length - 2;
      for (let node = this.parent; node && at >= 0; node = node.parent) if (node.matchesCompound(parts[at])) at -= 1;
      return at < 0;
    });
  }
  querySelectorAll(selector: string) { return this.descendants().filter((node) => node.matches(selector)); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
}

const PLAYER_SHELL: PlantedSpec[] = [
  { id: 'so-drawer', children: [{ class: 'drawer-toggle' }] },
  { id: 'drawer-manager', class: 'openDrawer', children: [{ attrs: { role: 'tablist' } }] },
  { id: 'chat', children: [{ class: 'mes', attrs: { mesid: '3' }, text: 'The road bends east.' }] },
];

async function sweepPlanted(plant: { panels?: PlantedSpec[]; message?: PlantedSpec[] }) {
  const g = globalThis as Record<string, any>;
  const shell: PlantedSpec[] = JSON.parse(JSON.stringify(PLAYER_SHELL));
  shell[2].children![0].children = plant.message ?? [];
  const root = new PlantedElement({ tag: 'body', children: [...shell, { id: 'so-panels-root', children: plant.panels ?? [] }] });
  g.document = { querySelectorAll: (selector: string) => root.querySelectorAll(selector), querySelector: (selector: string) => root.querySelector(selector),
    getElementById: (id: string) => root.querySelector(`#${id}`) };
  g.storyOrchestratorRuntime = { getSnapshot: () => ({ ui: { authorView: false }, inline: null }), getStory: () => null };
  const page = { evaluate: async (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg), waitForFunction: async () => undefined,
    locator: (selector: string) => ({ count: async () => root.querySelectorAll(selector).length, click: async () => undefined }) };
  try {
    return (await assertPlayerClean(page)).findings.map((finding: { needle: string }) => finding.needle);
  } finally {
    delete g.document;
    delete g.storyOrchestratorRuntime;
  }
}

test('planted DOM control: a player-only shell sweeps clean, and an unreadable selector would fail loudly', async () => {
  assert.deepEqual(await sweepPlanted({ panels: [{ attrs: { 'data-so': 'help-panel' }, text: 'How to play: write what you do.' }] }), []);
  assert.throws(() => new PlantedElement({}).matches('a:hover'), /cannot read selector part/);
});

test('planted DOM: the Activity panel opened in player mode is caught by the sweep', async () => {
  const findings = await sweepPlanted({ panels: [{ id: 'so-panel-activity', children: [{ id: 'so-activity', attrs: { 'data-so': 'activity' },
    children: [{ attrs: { 'data-so': 'activity-row' }, text: 'Rolled 4 of 6' }] }] }] });
  for (const selector of ['#so-panel-activity', '#so-activity', '[data-so="activity"]', '[data-so="activity-row"]']) {
    assert.ok(findings.includes(`${selector} reachable in #so-panels-root`), `${selector}: ${findings.join(' | ')}`);
  }
});

test('planted DOM: roll chips rendered under a player message are caught by the inline sweep', async () => {
  const findings = await sweepPlanted({ message: [{ attrs: { 'data-so': 'roll-chips', 'data-mesid': '3' }, children: [{ tag: 'button', attrs: { 'data-so': 'roll-chip' }, text: '4' }] }] });
  assert.ok(findings.includes('[data-so="roll-chips"] reachable under a message'), findings.join(' | '));
  assert.ok(findings.includes('[data-so="roll-chip"] reachable under a message'), findings.join(' | '));
});

test('planted DOM: an author page of the guide reader in player mode is caught by the sweep', { todo: 'so-ui.mts PLAYER_FORBIDDEN_SELECTORS has no guide-reader selector (#so-guide [data-audience="author"], [data-so="guide-page"][data-doc^="author/"]); owned by another agent' }, async () => {
  const findings = await sweepPlanted({ panels: [{ tag: 'section', id: 'so-guide', children: [
    { tag: 'nav', attrs: { 'data-so': 'guide-nav' }, children: [{ attrs: { 'data-audience': 'author' }, text: 'Writing a story' }] },
    { attrs: { 'data-so': 'guide-page', 'data-doc': 'author/README.md' }, text: 'Writing a story for Story Orchestrator' },
  ] }] });
  assert.ok(findings.some((needle) => /guide|data-audience="author"/.test(needle) && needle.includes('reachable in #so-panels-root')), findings.join(' | '));
});
