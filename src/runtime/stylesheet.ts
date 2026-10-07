let missing = false;

export const STYLESHEET_WARNING = "the extension stylesheet did not load";

export const stylesheetMissing = (): boolean => missing;

export async function loadStylesheet(load: () => Promise<unknown>, warn: (message: string, error: unknown) => void): Promise<boolean> {
  try {
    await load();
    missing = false;
  } catch (error) {
    missing = true;
    warn(STYLESHEET_WARNING, error);
  }
  return !missing;
}
