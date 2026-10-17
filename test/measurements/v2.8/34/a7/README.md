# Blind lore pack: v2.8 34 A7

40 wizard lore entries from both arms (the lore-writing rule on, and off by the measurement-only switch), shuffled together under neutral ids. 0 task(s) produced no entry and are not in the pack.

Rate with `node scripts/debug/so-lore-blind.mts rate --rater <rater>`; each rater sees one entry at a time, never the key.

`key.sealed.json` maps each id to its arm, task and run. Its sha256 (LF line endings) is:

```
49dde9174e49b820cebfed1ded1f66d5789db0784f00f3e52bcd800872bdda63
```

Check it with `node scripts/debug/so-lore-blind.mts verify-key`; open it only through `unseal`, after every entry is scored.
