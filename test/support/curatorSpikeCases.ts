import type { WiCuratorOp } from "../../src/stagecraft/types";

export const SP8_BOOK = "Story Lore";

export const SP8_ENTRIES = [
  { uid: 1, comment: "The Crown", key: ["king"], content: "The realm is at peace. {{// so:protect}}The king died in the winter of 402.{{// so:end}} His heir is young.", disable: false },
  { uid: 2, comment: "The Vault", key: ["vault"], content: "The vault is sealed. {{// so:protect}}Only the abbot holds the key. Nobody else may enter.", disable: true },
  { uid: 3, comment: "The Ferry", key: ["ferry"], content: "The ferry costs one copper.", disable: false },
];

export interface Sp8Case {
  id: string;
  line: string;
  op: WiCuratorOp;
}

const target = (comment: string) => {
  const entry = SP8_ENTRIES.find((candidate) => candidate.comment === comment)!;
  return { lorebook: SP8_BOOK, comment, uid: entry.uid };
};

const rewrite = (id: string, comment: string, text: string): Sp8Case => ({ id, line: `[rewrite] ${comment} || ${text}`, op: { kind: "rewrite", ...target(comment), text } });
const patch = (id: string, comment: string, head: string, tail: string | null, replace: string): Sp8Case => ({
  id,
  line: tail ? `[patch] ${comment} || ${head} || ${tail} || ${replace}` : `[patch] ${comment} || ${head} || ${replace}`,
  op: { kind: "patch", ...target(comment), anchor: tail ? `${head} || ${tail}` : head, replace },
});
const toggle = (id: string, kind: "enable" | "disable", comment: string): Sp8Case => ({ id, line: `[${kind}] ${comment}`, op: { kind, ...target(comment) } });

export const SP8_VIOLATIONS: Sp8Case[] = [
  rewrite("v1", "The Crown", "The realm is at peace. The king lives. His heir is young."),
  rewrite("v2", "The Crown", "The realm is at peace. {{// so:protect}}The king died in the winter of 403.{{// so:end}} His heir is young."),
  patch("v3", "The Crown", "The realm is", "the winter of 402", "The realm mourns a king who died long ago"),
  patch("v4", "The Crown", "winter of 402", "heir is young", "summer, and his heir is grown"),
  patch("v5", "The Crown", "The king died", "winter of 402.", "The king abdicated."),
  patch("v6", "The Crown", "{{// so:end}}", null, "and nobody mourns."),
  toggle("v7", "disable", "The Crown"),
  rewrite("v8", "The Ferry", "{{// so:auto}}The ferry costs two coppers."),
  patch("v9", "The Ferry", "one copper", null, "{{// so:protect}}two coppers"),
  patch("v10", "The Vault", "Nobody else", "may enter", "Anyone may enter"),
];

export const SP8_CONTROLS: Sp8Case[] = [
  toggle("c1", "enable", "The Vault"),
  patch("c2", "The Crown", "His heir is young", null, "His heir is grown."),
  rewrite("c3", "The Crown", "The realm mourns. {{// so:protect}}The king died in the winter of 402.{{// so:end}} His heir is crowned."),
  rewrite("c4", "The Ferry", "The ferry costs two coppers now."),
];
