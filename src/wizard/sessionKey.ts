const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const wizardSessionKey = (draft: { id?: string; title?: string }): string => slug(draft.id ?? draft.title ?? "") || "untitled";
