# v2.7 payload goldens

Payload invariance (v2.7 `16-test-plan.md` rule 3, `39-test-from-zero.md` C0/C3): the prompt ST would send for a
scripted group chat, captured on the frozen candidate (C0) and again on each later bundle (C3), compared
byte-for-byte after normalisation. Nothing is captured yet: the C0 goldens are taken on the frozen candidate.

## Layout

```
test/measurements/v2.7/payload/
  c0/                    baseline, captured at C0 on the frozen candidate
    index.json           label, capturedAt, served bundle sha256 + served dist/manifest.json, run-header pointer
                         {path, sha256, captured}, the normalisation rules, one row per case
    run-header.json      so-run-header capture taken just before the cases (absent when --run-header named one)
    <case>.json          {case, fixture, fixtureSha256, chatIds, captures: [{label, member, mainApi,
                         promptKind, checkpoint, prompt, blocks: [{key, value, position, depth, role, scan}]}]}
  c3/                    the candidate capture, same shape, plus payload-diff.json (the diff report)
  declared.json          the declared differences, each with its plan and v2.8 owner row
```

A directory without `index.json` is not a capture: a failed case writes `capture-failed.json` instead, so a
partial run can never be diffed as a baseline.

## Cases

One file per case in `test/scenarios/payload/*.json`: ordinary so-scenario fixtures, run only through the capture
tool (it installs the in-page probe they call). Sun-ruins in the toy group `1759606632088`, judge off, every turn
scripted (`/send compact`, `/sendas`), extraction and the curator pinned, and a tripwire that fails the case on any
`/generate` or judge-plugin request. A capture is the resting prompt or one member drafted through the runtime's
draft hook; ST's group dry run renders the first enabled member's card, so member captures differ only in what the
extension stages. Changing a fixture changes its sha256 and the diff refuses it: re-capture the baseline instead.

## Commands

```
node scripts/debug/so-payload-golden.mts capture --label c0 --out test/measurements/v2.7/payload/c0
node scripts/debug/so-payload-golden.mts capture --label c3 --out test/measurements/v2.7/payload/c3
node scripts/debug/so-payload-golden.mts diff test/measurements/v2.7/payload/c0 test/measurements/v2.7/payload/c3 --declared test/measurements/v2.7/payload/declared.json
```

Run on a lane serving the dev build (`st-lanes.mts run <n> -- scripts/debug/so-payload-golden.mts capture ...`).
Captures and the diff are deterministic tiers (D); run each twice as rule 2 asks.

## Normalisation

Only these vary between two captures of the same bundle and are replaced before comparing (raw text is stored):
ISO timestamps, ST's humanized stamps (chat file names), message send dates / `{{date}}`, `{{time}}` clock values,
13-digit epoch-ms ids, UUIDs, and each side's own sandbox chat ids (literal). Anything else that differs is a
difference. A card or story that uses another volatile macro (`{{weekday}}`, `{{idle_duration}}`, `{{random}}`)
needs a new rule in `scripts/debug/lib/payloadGolden.mts` with a planted control in its test.

## Declared differences

```json
{ "declarations": [
  { "case": "group-opening", "label": "turn-dm", "plan": "v2.7 02 C1", "owner": "v2.8 16",
    "added": [{ "contains": "SO-SP5 scenario one" }], "removed": [], "why": "the story-owned scenario block" }
] }
```

`label` is optional (all captures of the case). A pattern is a substring, `{contains}` or `{regex, flags?}`; a
changed hunk passes only when the patterns consume every changed line. The diff exits 1 on an undeclared hunk, on a
declaration or pattern that never happened (stale), on a missing or extra case, and on a changed fixture.

The goldens hold only the sun-ruins example story and scripted lines, so they are public; never add an Adolion case
here (campaign text goes to the private `so-sessions` repo).
