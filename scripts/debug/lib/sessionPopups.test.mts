import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { answeringPopups, popupProblems, START_POPUP_RULES } from './sessionPopups.mts';
import { fakePage } from './sessionFakes.mts';

afterEach(() => { delete (globalThis as any).document; });

function fakeDom() {
  const open: any[] = [];
  const dialog = (text: string, labels: Array<[string, string]>, onResult: (label: string) => void) => {
    const attributes = new Map<string, string>();
    const element: any = {
      textContent: text,
      hasAttribute: (name: string) => attributes.has(name),
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      querySelector: (selector: string) => {
        if (selector === '.popup-content') return { textContent: text };
        if (selector === '.popup-button-cancel') return element.buttons.find((button: any) => button.kind === 'cancel') ?? null;
        return null;
      },
      querySelectorAll: () => element.buttons,
      buttons: labels.map(([label, kind]) => ({ textContent: label, kind, click: () => { open.splice(open.indexOf(element), 1); onResult(label); } })),
    };
    open.push(element);
    return element;
  };
  (globalThis as any).document = { querySelectorAll: (selector: string) => (selector === 'dialog[open]' ? [...open] : []) };
  return { open, dialog };
}

const CHAPTER_JUMP = 'Jumping to Home to Nightriver (Act III: House Nightriver) leaves the chapter Acts I-II: The Adventurer\'s Road. A jump is not proof the chapter was played, so it is sealed into a record only if you say so.';

test('T4-1 start: the chapter-jump confirm a startAt raises is answered "Jump without sealing", and the jump completes instead of hanging', async () => {
  const dom = fakeDom();
  let answer: string | null = null;
  const work = new Promise<string>((done) => {
    dom.dialog(CHAPTER_JUMP, [['Seal it, then jump', 'ok'], ['Jump without sealing', 'custom'], ['Cancel', 'cancel']], (label) => { answer = label; done('nightriver-house'); });
  });
  const outcome = await answeringPopups(fakePage(), work, START_POPUP_RULES, { timeoutMs: 5000 });
  assert.equal(answer, 'Jump without sealing');
  assert.equal(outcome.result, 'nightriver-house');
  assert.deepEqual(outcome.answered.map((entry) => [entry.rule, entry.answer, entry.clicked]), [['chapter-jump', 'Jump without sealing', true]]);
  assert.deepEqual(outcome.unexpected, []);
  assert.deepEqual(popupProblems('startAt nightriver-house', outcome, 5000), []);
});

test('T4-1 start: any other popup is dismissed and fails the start closed, and a popup nobody answers times out instead of hanging', async () => {
  const dom = fakeDom();
  const work = new Promise<string>((done) => {
    dom.dialog('Overwrite the selected story with a different one?', [['OK', 'ok'], ['Cancel', 'cancel']], () => done('guild-hall'));
  });
  const outcome = await answeringPopups(fakePage(), work, START_POPUP_RULES, { timeoutMs: 5000 });
  assert.equal(outcome.unexpected.length, 1);
  assert.match(popupProblems('startAt x', outcome, 5000)[0], /unexpected popup opened .*Overwrite the selected story/);
  let clock = 0;
  const stuck = await answeringPopups(fakePage({ waitForTimeout: async () => { clock += 1000; } }), new Promise<string>(() => undefined), START_POPUP_RULES, { timeoutMs: 3000, now: () => clock });
  assert.equal(stuck.timedOut, true);
  assert.match(popupProblems('startAt x', stuck, 3000)[0], /did not finish within 3000 ms/);
});
