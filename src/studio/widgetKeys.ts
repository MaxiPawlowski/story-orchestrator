import { gateKeys, type StoryWidget, type WidgetBind, type WidgetClue } from "@engine/index";

type AuthoredClue = Partial<WidgetClue> & { quality?: unknown };

export const clueKeys = (clue: WidgetClue): string[] => {
  const authored = clue as AuthoredClue;
  if (authored.when) return gateKeys(authored.when);
  return typeof authored.quality === "string" && authored.quality.trim() ? [authored.quality.trim()] : [];
};

export const authoredBind = (widget: Pick<StoryWidget, "bind">): WidgetBind | undefined => {
  const bind: unknown = widget.bind;
  if (typeof bind === "string") return bind.startsWith("quality:") && bind.length > 8 ? { quality: bind.slice(8).trim() } : undefined;
  return bind && typeof bind === "object" ? (bind as WidgetBind) : undefined;
};
