export const AUTHOR_SLASH_PATTERN = '(^|\\|)\\s*/(cp|checkpoint|so-mem)(\\s|\\||$)';

export const needsAuthorView = (command: string): boolean => new RegExp(AUTHOR_SLASH_PATTERN).test(command);

export async function authorSlashInPage({ cmd, pattern }: { cmd: string; pattern: string }) {
  const host = globalThis as any;
  const rt = host.storyOrchestratorRuntime;
  const grant = new RegExp(pattern).test(cmd) && rt?.getSnapshot?.()?.ui?.authorView === false && typeof rt?.setUiSettings === 'function';
  if (grant) rt.setUiSettings({ authorView: true });
  try {
    const res = await host.SillyTavern.getContext().executeSlashCommandsWithOptions(cmd);
    return { ok: true, isError: Boolean(res?.isError), pipe: typeof res?.pipe === 'string' ? res.pipe.slice(0, 500) : null, authorViewGranted: grant };
  } catch (err) {
    return { ok: false, isError: true, error: (err as Error)?.message || String(err), pipe: null, authorViewGranted: grant };
  } finally {
    if (grant) rt.setUiSettings({ authorView: false });
  }
}
