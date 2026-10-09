export const AUTHOR_SLASH_PATTERN = '(^|\\|)\\s*/(cp|checkpoint|so-mem)(\\s|\\||$)';

export const JUMP_SLASH_PATTERN = '(^|\\|)\\s*/(cp|checkpoint)\\s+activate(\\s|\\||$)';

export const JUMP_PROMPT_TEXT = 'sealed into a record only if you say so';

export const JUMP_SKIP_LABEL = 'Jump without sealing';

export const needsAuthorView = (command: string): boolean => new RegExp(AUTHOR_SLASH_PATTERN).test(command);

export async function authorSlashInPage({ cmd, pattern, jumpPattern, jumpText, skipLabel }: { cmd: string; pattern: string; jumpPattern?: string; jumpText?: string; skipLabel?: string }) {
  const host = globalThis as any;
  const rt = host.storyOrchestratorRuntime;
  const grant = new RegExp(pattern).test(cmd) && rt?.getSnapshot?.()?.ui?.authorView === false && typeof rt?.setUiSettings === 'function';
  const jump = Boolean(jumpPattern && jumpText && skipLabel && new RegExp(jumpPattern).test(cmd));
  let jumpPromptsSkipped = 0;
  const settleJump = () => {
    for (const dialog of Array.from(host.document?.querySelectorAll?.('dialog[open]') ?? []) as any[]) {
      if (!String(dialog.textContent ?? '').includes(jumpText as string)) continue;
      const button = (Array.from(dialog.querySelectorAll('.menu_button')) as any[]).find((candidate) => String(candidate.textContent ?? '').trim() === skipLabel);
      if (button) { jumpPromptsSkipped += 1; button.click(); }
    }
  };
  const timer = jump ? setInterval(settleJump, 250) : null;
  if (grant) rt.setUiSettings({ authorView: true });
  try {
    const res = await host.SillyTavern.getContext().executeSlashCommandsWithOptions(cmd);
    return { ok: true, isError: Boolean(res?.isError), pipe: typeof res?.pipe === 'string' ? res.pipe.slice(0, 500) : null, authorViewGranted: grant, ...(jump ? { jumpPromptsSkipped } : {}) };
  } catch (err) {
    return { ok: false, isError: true, error: (err as Error)?.message || String(err), pipe: null, authorViewGranted: grant, ...(jump ? { jumpPromptsSkipped } : {}) };
  } finally {
    if (timer) clearInterval(timer);
    if (grant) rt.setUiSettings({ authorView: false });
  }
}

export const authorSlashArgs = (cmd: string) => ({ cmd, pattern: AUTHOR_SLASH_PATTERN, jumpPattern: JUMP_SLASH_PATTERN, jumpText: JUMP_PROMPT_TEXT, skipLabel: JUMP_SKIP_LABEL });
