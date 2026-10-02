import { evaluateInST } from './evaluate.mts';

export interface PopupRule { id: string; match: RegExp; answer: string; why: string }
export interface OpenPopup { index: number; text: string; buttons: string[] }
export interface PopupAnswer { rule: string; text: string; answer: string; clicked: boolean; why: string }
export interface PopupOutcome<T> { result: T | null; answered: PopupAnswer[]; unexpected: string[]; timedOut: boolean; error: string | null }

export const HANDLED_MARK = 'data-so-session-handled';

export const CHAPTER_JUMP_RULE: PopupRule = {
  id: 'chapter-jump',
  match: /sealed into a record only if you say so/i,
  answer: 'Jump without sealing',
  why: 'a startAt jump is a debug jump: nothing of the chapter it leaves was played, so nothing is sealed',
};

export const START_POPUP_RULES: readonly PopupRule[] = [CHAPTER_JUMP_RULE];

export const readOpenPopups = (page: any): Promise<OpenPopup[]> => evaluateInST(page, (mark: string) => [...document.querySelectorAll('dialog[open]')]
  .map((dialog, index) => ({ dialog, index }))
  .filter(({ dialog }) => !dialog.hasAttribute(mark))
  .map(({ dialog, index }) => ({
    index,
    text: String(dialog.querySelector('.popup-content')?.textContent ?? dialog.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    buttons: [...dialog.querySelectorAll('[data-result]')].map((button) => String(button.textContent ?? '').trim()).filter(Boolean),
  })), HANDLED_MARK);

const pressPopup = (page: any, index: number, label: string | null): Promise<boolean> => evaluateInST(page, ({ index, label, mark }: { index: number; label: string | null; mark: string }) => {
  const dialog = document.querySelectorAll('dialog[open]')[index];
  if (!dialog) return false;
  dialog.setAttribute(mark, label ?? 'dismissed');
  const buttons = [...dialog.querySelectorAll('[data-result]')] as HTMLElement[];
  const button = label === null ? (dialog.querySelector('.popup-button-cancel') as HTMLElement | null) : buttons.find((candidate) => String(candidate.textContent ?? '').trim() === label);
  if (!button) return false;
  button.click();
  return true;
}, { index, label, mark: HANDLED_MARK });

export async function answeringPopups<T>(page: any, work: Promise<T>, rules: readonly PopupRule[], { timeoutMs = 120000, pollMs = 250, now = () => Date.now() }: { timeoutMs?: number; pollMs?: number; now?: () => number } = {}): Promise<PopupOutcome<T>> {
  const outcome: PopupOutcome<T> = { result: null, answered: [], unexpected: [], timedOut: false, error: null };
  let settled = false;
  work.then((value) => { outcome.result = value; settled = true; }, (error) => { outcome.error = error instanceof Error ? error.message : String(error); settled = true; });
  const handle = async () => {
    for (const popup of await readOpenPopups(page)) {
      const rule = rules.find((candidate) => candidate.match.test(popup.text));
      if (rule) outcome.answered.push({ rule: rule.id, text: popup.text, answer: rule.answer, clicked: await pressPopup(page, popup.index, rule.answer), why: rule.why });
      else {
        outcome.unexpected.push(popup.text);
        await pressPopup(page, popup.index, null);
      }
    }
  };
  const started = now();
  while (!settled) {
    if (now() - started >= timeoutMs) { outcome.timedOut = true; return outcome; }
    await handle();
    if (settled) break;
    await page.waitForTimeout(pollMs);
  }
  await handle();
  return outcome;
}

export function popupProblems(where: string, outcome: PopupOutcome<unknown>, timeoutMs: number): string[] {
  return [
    ...outcome.unexpected.map((text) => `${where}: an unexpected popup opened ("${text.slice(0, 200)}"); start answers only ${START_POPUP_RULES.map((rule) => rule.id).join(', ')}, so it was dismissed and the start fails closed`),
    ...outcome.answered.filter((answer) => !answer.clicked).map((answer) => `${where}: the ${answer.rule} popup has no "${answer.answer}" button`),
    ...(outcome.timedOut ? [`${where}: did not finish within ${timeoutMs} ms (a popup nobody answered?)`] : []),
    ...(outcome.error ? [`${where}: ${outcome.error}`] : []),
  ];
}
