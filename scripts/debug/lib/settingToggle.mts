export interface ToggleRead {
  found: boolean;
  kind: 'switch' | 'checkbox' | 'other' | null;
  on: boolean | null;
  disabled: boolean;
}

export interface ToggleResult extends ToggleRead {
  clicked: boolean;
  ok: boolean;
  reason?: string;
}

interface ToggleElement {
  tagName?: string;
  type?: string;
  checked?: boolean;
  disabled?: boolean;
  getAttribute(name: string): string | null;
  closest(selector: string): { click(): void } | null;
  click(): void;
}

export const toggleSettingInPage = ({ selector, on }: { selector: string; on: boolean }): ToggleResult => {
  const read = (element: ToggleElement | null): ToggleRead => {
    if (!element) return { found: false, kind: null, on: null, disabled: false };
    const disabled = element.disabled === true || element.getAttribute('aria-disabled') === 'true';
    if (element.getAttribute('role') === 'switch') {
      const state = element.getAttribute('aria-checked');
      return { found: true, kind: 'switch', on: state === 'true' ? true : state === 'false' ? false : null, disabled };
    }
    if (String(element.tagName).toUpperCase() === 'INPUT' && element.type === 'checkbox') return { found: true, kind: 'checkbox', on: element.checked === true, disabled };
    return { found: true, kind: 'other', on: null, disabled };
  };
  const element = (globalThis as unknown as { document: { querySelector(s: string): ToggleElement | null } }).document.querySelector(selector);
  const before = read(element);
  if (!element || !before.found) return { ...before, clicked: false, ok: false, reason: `no element matches ${selector}` };
  if (before.kind === 'other' || before.on === null) return { ...before, clicked: false, ok: false, reason: `${selector} is neither a role=switch nor a checkbox` };
  if (before.on === on) return { ...before, clicked: false, ok: true };
  if (before.disabled) return { ...before, clicked: false, ok: false, reason: `${selector} is disabled` };
  if (before.kind === 'checkbox') (element.closest('label') ?? element).click();
  else element.click();
  return { ...read(element), clicked: true, ok: true };
};

export const toggleSetting = async (page: { evaluate<A, R>(fn: (arg: A) => R, arg: A): Promise<R> }, selector: string, on: boolean): Promise<ToggleResult> =>
  page.evaluate(toggleSettingInPage, { selector, on });
