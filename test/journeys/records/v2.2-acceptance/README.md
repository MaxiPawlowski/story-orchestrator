# v2.2 acceptance records

Archived because `.debug` rotates. Each run here is a real-model, fresh-start browser run against
the live judge plugin — no mocks, no `debugResponse` on any judge path.

## J11 — judgment backend

| run | file | log | strict | result |
|---|---|---|---|---|
| A | `journey-J11-run1.json` | `logs/j11-run-A.log` | no | **26/26 pass** |
| B | `journey-J11-run2.json` | `logs/j11-run-B.log` | yes | **26/26 pass** |

Two consecutive clean full runs, the second with `--strict`, so J11 is green as a gate (v2.1 rule:
a journey is believed only after it has run twice).

Backend for both runs: Artemis 31B (`TheDrummer_Artemis-31B-v1.1-Q4_K_M`) on llama.cpp `b11046`,
RunPod pod `llm-pod-4500` (RTX PRO 4500). Judge model `jev-1.13.0` through the ST server plugin.

### Getting here

J11 progressed 19 → 21 → 22 → 24 → 26 across the session. The last three fixes, all in
`053dd81`:

- **J11.15** had never passed. It seeded `location` with `"shaded hollow"`, which is not one of the
  enum values the story declares (`guild hall | town gate | desert road`), so `setQuality` dropped
  it silently, the scene cursor was never seeded, and the later change to `"desert road"` could not
  read as a change. An earlier fix (43a2c56) claimed to address this and did not. It also inherited
  whatever cadence the previous check left: at cadence 1 every boundary already reads, so the
  scene-triggered read folds into the cadence read and the check can never observe `scene:location`.
  It now seeds `"town gate"` and pins cadence 50.
- **J11.16** died on a hard-coded 15 s idle wait inside `sendUserMessage` that the check's own
  300000 ms budget never reached. Harmless on the old 5090; at ~33 tok/s ordinary turns run 15–35 s.
  Now `preSendIdleTimeoutMs`, default 60 s.
- **J11.23 and J11.25** failed once and then passed twice with no change. J11.23's stall call
  answered at `max p 0.94` against a `STALL_DIRECT_P` of 0.95 and re-read instead of writing
  directly; J11.25's scene read returned no heading. Both are model-output variance. Neither
  threshold was touched — adjusting a calibrated floor to fit one sample would have traded a real
  guard for a green tick.

### Product bugs these gates found (all fixed, earlier commits)

1. A scene read keyed to a deleted message survived the delete when no boundary had fired on it.
2. Every off-path judge use inherited the 1500 ms reply-path budget and timed out.
3. A stall call that fell back recorded its leaves as answered when nothing had been.
