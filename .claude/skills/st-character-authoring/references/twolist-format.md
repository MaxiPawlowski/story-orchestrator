# TwoList card format

Open this when a user asks for a TwoList card, or you are weighing a keyword-dense card format. It is a hand-authoring convention with no ST support and nothing to import. Its lorebook twin, **LoreList**, has the same shape and belongs to the `st-lorebook-authoring` skill.

**Weight of evidence:** one solo post (2025-05, 1 upvote, no replies), built by its author while targeting **Gemini**. Nobody else tested it in the thread. Treat it as one person's style, not community consensus. It also runs against the thread-level advice in `writing-craft.md` §1 (clear sentences beat compressed notation).

## Shape

Each character gets two parts, in this order:

**1. Summary Line**: one bracketed line of `|`-separated fields.

```
[Identifier|Age|Role (Specialization)|Descriptor|Lore snippet|…]
```

- Field 1 is the identifier (`lastname, firstname`, a moniker, or the full name). Field 2 is the age (`22`, `ageless (appears 30s)`). Field 3 is the role, with any specialization in `( )`.
- Any number of short descriptor or lore fields follow, each separated by a single `|`.

**2. Detailed Keyword Block**: immediately after the summary line.

```
[ # CharacterName:
(keyword one, phrase two, item three, another keyword)]
```

- A `# Name:` header, then one `( … )` list separated by comma-space. Lower-case except proper nouns. Close with `)]`.
- The block is a Danbooru-style tag dump: appearance, personality, themes, abilities, and cross-references to other lore entries (`Fu Zhou Academy`, `Class SZ2`), all flattened into one list.

**Author's checklist**: one summary line and one keyword block per character, the block directly after its line · `|` only inside the summary line · `, ` only inside the parentheses · every `[`/`(` closed · the header starts with `# ` and ends with `:`.

## Worked example (trimmed; the original block has ~120 tags)

```
[rirsh, icia|19|exchange student (occult studies)|olive skin tone|cult survivor (multiple traditions)|accidentally summoned demon boyfriend Bhima|Class SZ2 (Fu Zhou Academy)|fears past & Bhima's cultic influence]
[ # icia rirsh:
(emo undercut, grey eyes, ripped uniform, sigil ring, slight build, dark academia fashion, anxious, shy character, compulsive cleaning, touch aversion, trauma recovery, secretly powerful, hidden talents (silent spellcasting, mana sensitivity), Fu Zhou Academy, Class SZ2, dark fantasy, coming-of-age, reluctant chosen one)]
```

The full demo card was only posted as a PNG attachment and could not be recovered as text.

## Using it with ST

- Put both parts in **Description**, or put the summary line in Description and the keyword block in the Character's Note. Nothing in ST parses the brackets. The model sees plain text.
- **Pipe hazard**: `|` ends a quoted value in STscript unless strict escaping is on (verified: st:public/scripts/slash-commands/SlashCommandParser.js:969-972, 1235-1245; `st:` = `C:\dev\SillyTavern-MainBranch\`). Create TwoList cards through the UI, `/api/characters/create`, or an imported JSON (`creating-cards.md` §1), not through a `/char-create description="…"` one-liner.
- Test it the same way as any format: fixed questions, a few models, and compare against a natural-language version of the same character.
