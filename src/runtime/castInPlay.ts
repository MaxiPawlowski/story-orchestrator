export const CAST_IN_PLAY_WINDOW = 12;

type CastRow = { name?: unknown; mes?: unknown; is_user?: unknown; is_system?: unknown } | null | undefined;

const words = (text: unknown) => new Set(String(text ?? "").toLowerCase().match(/\b\w+\b/g) ?? []);

export const castInPlay = (names: string[], rows: unknown[], window = CAST_IN_PLAY_WINDOW): string[] => {
  const recent = (rows as CastRow[]).slice(-window).filter((row) => row && !row.is_system);
  const playerWords = recent.filter((row) => row?.is_user).map((row) => words(row?.mes));
  const spoke = new Set(recent.filter((row) => !row?.is_user).map((row) => String(row?.name ?? "").trim().toLowerCase()));
  return names.filter((name) => spoke.has(name.trim().toLowerCase())
    && playerWords.some((said) => [...words(name)].every((word) => said.has(word))));
};

export const castInPlayNote = (checkpoint: string, disabled: string[], rows: unknown): { summary: string; note: string } | null => {
  const dropped = castInPlay(disabled, Array.isArray(rows) ? rows : []);
  return dropped.length ? {
    summary: `cast change at "${checkpoint}" removed ${dropped.join(", ")}, whom the play just brought in`,
    note: "the authored cast_changes.disable wins; to keep a member the play recruits, gate this change on a quality the play sets",
  } : null;
};
