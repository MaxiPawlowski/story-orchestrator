# Plan 71 — every remaining GPU row, two ways to run it, pod hours and cost

**Status (2026-10-17): WRITTEN, not run.** Owner: "Let's plan everything that still requires some GPU to be tested. How much
pod time do you think we need?" Planning only: no run, lane, model, pod or GPU used. Inputs: `70-final-suite.md` (rows,
budget, owner decisions 2026-10-17), `32-queue.md` (R1–R14, M-rows), `24-test-plan.md` (rates, §Cuts, §Cost),
`test/phase-c/pod-estimates.json` (pod start/stop, runMin), `31-v27-wrap-backlog.md` §Pod round / §Pod 2 measurements
(measured pod facts), `test/sessions/BUDGET.md` (pod history), Gate records of 01, 15–17, 22, 28, 33, 36, 41, 42, 48, 49,
51, 53, 55, 62, 63. Rules unchanged: AGENTS.md RunPod (Secure, EU-RO-1, RTX PRO 4500 $0.72/h, volume `x9gi6f1rig`, SSH
tunnels only; images local on the 3090), plan 24 rules 1–12, plan 70 rules 1–5.

**Headline.** About **68 h of Artemis wall time** plus **8.4 h of 3090 image time**.

- **(A)** final suite on the 3090 (about 34 h, 4–5 nights), pod for the rows only a pod can carry plus the blind-pack arms:
  **about 41 billed pod-hours, about USD 29**, plus 42 h on the 3090.
- **(B)** everything Artemis on pods: **about 80 billed pod-hours, about USD 58**, plus 9 h on the 3090.

Recommended: **A**, in 4 pod sessions (§Session plan). Both exceed plan 24's EUR 20 v2.8 RunPod cap. RunPod is also
unfunded for the rest of October (gotchas §Model). An owner decision is needed (§Decisions).

## Corrections to plan 70's numbers (read first)

1. **D2 is bigger than +2.2 h.** Plan 70 priced "Artemis for the former cloud rows" as AS-smoke ×9 ×2 + GS2 ×2 (+2.2 h).
   Its own CL section counts about **800 reply turns** on CL lanes (§Budget, cloud spend). AS-smoke + GS2 are about 175
   of them. The other ~625 turns (journeys J1–J12, targeted CL rows, the O/33-W block, privacy, suggestions, C8b, 22
   L1/L5, 13 consumers, 34 lore-select, M16/M17/M20, adversarial reads, Wc/RB, CL informational with replies) at 2.5 min
   a turn (synthetic rate; the cloud rate was 1.5) are about 26 lane-h, so **13 h more of wall time** at the measured
   two-lane share (0.5). Sol-only rows (wizard, Ask, C7, A6, 09 live, 48 S7–S11 replay, raters) and TypeSafe stay off
   the GPU.
2. **SP6 is about 31 lane-h, not 10.** K3 is release/control × judge on/off, ×2 each = 8 cells of the 98-turn
   `sp6-adolion` journey (17 §Floor). One cell measured 3 h 54 min on the 3090 with the judge on (31 §3090, item 4).
   At 3.7 h a cell (judge-off cells somewhat faster), K3 alone is about 29.6 lane-h. The 35-K3/K4/K5 `-C5` ids are the
   same measurement re-run on a fixed build. Run on F, one pair covers both ids (assumption, §Unresolved 2).
3. **R2/R7 fit on the RTX PRO 4500.** Plan 24 says P2 "needs more VRAM than the 3090 or the RTX PRO 4500 hold". Pod 2
   measured the facts:
   - Only `--swa-full` at `LLM_CTX` 98304 fails on the 32 GB card.
   - `--swa-full` at 24576 fits (30.7 GB), and the PFX/R7 protocol (`place-all.sh`, chat cut to 80 rows, 13–16K-token
     prompts) runs there.
   - B1-HIST's 98K control runs without `--swa-full`. Pod 2 ran it; `kv-unified` 196,608 total at parallel 4 ran on
     this card on 2026-10-01.
   - So no bigger card is needed unless the owner wants `--swa-full` at 98K (A100 80 GB, $1.59/h, EU-RO-1, used
     2026-10-01).

## Basis

- Rates: plan 24 lane-minutes, 3.0 min per campaign turn, 3.5 Saga, 2.5 synthetic. Two model lanes on one GPU: 0.5
  wall-h per planned lane-h (measured 0.44–0.48, plan 70 §Budget). Solo rows count at 1.0.
- Pod throughput is taken as the 3090's. RTX PRO 4500 single-stream decode measured 29.3 tok/s (pod 2). Same v1.1
  weights, different quantizer (X3).
- Billed pod time = work + **0.75 h fixed per session** + **10 % idle**.
  - Fixed: create and boot (12 min, `pod-estimates.json` `podStartMin`), model load from the volume, `so-pod up` and
    the profile probe, `so-pod pull`/`release`, terminate (6 min).
  - Idle: row changes, triage pauses, watchdog margins.
  - Lanes are seeded and snapshotted locally **before** the pod is created, so seeding is not billed.
- Network volume `x9gi6f1rig`: 50 GB at about USD 0.07/GB-month = **about USD 3.50 a month**. Already billed whether or
  not a pod runs (BUDGET.md: storage pre-existing, not counted per round).
- `SO_MAX_LLM_LANES` (2) counts **machine-wide**: ST lanes and browsers run on this PC for both the 3090 and the pod. Two
  pod lanes and two 3090 lanes at once need `--allow-load` (RAM risk; round 1 stopped on a RAM hold).

## 1. Every remaining GPU row

Columns: carrier, model, runs, wall h (at the shares above), where it can run. "3090" = the owner's GPU through the
local controller. "Pod" = Artemis v1.1 on llama-server over an SSH tunnel.

### 1.1 Final suite (plan 70), Artemis

| Row | Carrier | Model | Runs | Wall h | Runs on |
|---|---|---|---|---|---|
| Acceptance block: GS1, GS3, GS4, GS6, commit-model, encounters, promises live, T8, 45 seal, T-R4, J13, shakedowns, restores, 15 % slack | 70 §Artemis rows, §Budget | Artemis RP / RP-read | ×2 | 7.0 | 3090 or pod (prefer 3090: play route, see §4) |
| 42 W4 recorder (74 reads, both arms) | `so-witness.mts record` | Artemis read | ×1, solo | 0.75 | either; Wc latency row is host-specific |
| T-Q3, encounters M2 tail, over-steer card | 70 §Artemis rows | Artemis RP | ×1 | 1.4 | either |
| 47 P7/P7h | scripted relevance session | Artemis LT | ×1 | 0.5 | **3090 only** (LT = local route by tier) |
| D2: AS-smoke ×9, GS2 | `live-v28-24-smoke-*`, `gs2-living-hub` | Artemis reply/read | ×2 | 2.2 | either |
| D2: the other ~625 former-CL reply turns | 70 §Cloud rows (journeys, targeted, O/33-W, privacy, suggestions, C8b, 22 L1/L5, 13, 34, M16/M17/M20, 35 G3/G4 reads, 42 Wc/RB, CL informational) | Artemis reply/read; Sol, TypeSafe beside | ×2 (A), ×1 (I) | 13.0 | either |
| Conditionals at freeze on Artemis: 47 P1/P2 (RP-read, ~164 reads), 44 G7/G8 (20 cases on/off) + G14 (30 turns ×1), 18 S8 (10 cases) | `so-promises`, `so-rumor-voicing`, `so-q7-failure` | Artemis | ×2 (G14 ×1) | 3.3 | either |
| D2 reads with no reply: R9 J6d extractor leg, R10 cue/scene A/B, 13 N5, 01 C13-b | 70 §CL informational | Artemis read | ×1–×2 | 1.0 | either |
| Triage slack on the D2 and conditional rows (15 %) | — | — | — | 2.9 | either |
| **Subtotal** | | | | **32.0** | pod-capable 31.5 |

### 1.2 Measurements for a pod (D5/D6, owner 2026-10-17)

| Row | Carrier | Model | Runs | Wall h | Runs on |
|---|---|---|---|---|---|
| SP6 K3/K4 (= 49 C8, R12, 35-K3/K4 and `-C5`) | campaign `lab/complications/sp6-adolion.journey.json`, 98 turns; K4 from the same replies | Artemis replies, read route recorded, TypeSafe on/off | 8 cells (release/control × judge on/off, ×2); release lane and control lane in parallel | 14.8 | pod (D5) or 3090 |
| SP6 K5 (= R3, 35-K5 and `-C5`) | `sp6-k5-stalled.json`, release vs control | Artemis | ×2 per arm, K5 pooled per arm (49 Stage B rule) | 0.7 | pod or 3090 |
| SP6 seeds/restores | — | — | — | 0.2 | — |
| R7 + B1-PFX re-measure (late lore, D-P5 built) | pod 2 `place-all.sh`: control vs late ×2 (order flipped in run 2), `--swa-full` at 24576 with the B1 flags; 40 blind pairs rated offline | Artemis, quiet lane, 300-token replies | 4 arm-runs × 80 replies, **solo** | 3.25 (incl. one server restart) | **pod only** (30.7 GB) |
| B1-HIST (R2): 98K vs 24576 history | 30 turns + 10 private recall probes per arm, both arms at once from one seeded image | Artemis, judge on, memory on the pod | ×2 | 5.5 | **pod only** (98K) |
| 63 H6r + H1 front-trim latency arms | 63 §GPU queue (`so-trim-arms`, `so-history-recall`); H6r first, `prep --arm fits` last | Artemis, side calls off, cold reloads | H6r ×1 (10 probes, both arms), H1 4 arm-runs × 50 turns, **solo** | 2.3 | pod (D6) or 3090; on a pod set per-slot ctx 32768 to match 63's arms |
| **Subtotal** | | | | **26.8** | |

Not counted: 49 C9/C10 (Phase 3, built only on SP6 PASS; C). 35-M2-C5 (120 min ×2, 2 h wall) is optional: the suite's M2
tail already records 19 M2.

### 1.3 Deferred blind-pack arms (24 §Cuts 10)

| Row | Carrier | Model | Runs | Wall h | Runs on |
|---|---|---|---|---|---|
| R5 B1-NARR run 2 | P3 vs pre-P3 copies, both arms at once, 20 Narrator turns each | Artemis | ×1 (completes the pair) | 2.0 | either |
| B1-R4 (R4: 16 more climax pairs) | 01 §E arms, checkpoint `high` vs install `medium` | Artemis, thinking | ×1 | 1.0 (parallel with 37-M3) | either |
| 37-M3 | `pod-estimates.json` row (after 34-RP) | Artemis | ×1 | (in the line above, 0.75 lane-h) | either |
| Thinking A/B, one candidate | 01 §D kit `C:\dev\so-lanes\artemis-think\`, 20 blind turns | candidate (Cydonia 24B v4.3 or Skyfall 31B v4.2) vs Artemis | ×1 | 2.4 (v2.6 measured 2.36) | either; **candidate GGUF download needs the owner's OK** |
| M24 living blind pairs + M3 hybrid | 22 M2/M3, second-model rater | Artemis | ×1 | 2.0 (estimate, no carrier timing) | either; **C: needs M21 at floor in GS2** |
| R8 off-default arms (Q-M5/P3, inner voice B2/C, W6) | none written | — | — | not budgeted | packs from GS replies cover the default arms (24 §Measurement rows) |
| **Subtotal** | | | | **7.4** | |

### 1.4 Image POC (3090 only)

No documented pod path. The product image flow needs the GPU broker and media plugin on loopback beside the controller
(plan 28). LI is local by definition (24 §tiers). R14 `retainBatches` is **done** (queue R14, 3090 re-run ×2).

| Row | Carrier | Model | Runs | Wall h |
|---|---|---|---|---|
| Setup: controller on the fixed scheduler, ComfyUI warm, lane 31/33 seeds, plugins installed | — | — | — | 0.5 |
| 41 journey shakedown on the fixed controller (owed, 41 Gate record 2026-10-15) | `so-p41-journey.mts run 1 --candidate` | Qwen edits, Sol vision | ×1 | 0.6 |
| Hatted busts re-kept with the detector head box (36 Gate record 2026-10-16) | base builder | Qwen | ×1 | 0.2 |
| 41 product journey: prepared presentation, reference views with per-view seconds and peak VRAM (22 GB floor), look rebuild (stand-in fix), cast scene on the showcase busts | `so-p41-journey.mts` | Qwen, Artemis through the broker | ×2 | 2.8 |
| 33 product Acceptance: latency pair (floor 1.10) + pose coverage, with the fair-window broker | 33 §Ready to run, driver timeout ≥ 90 min | Artemis + Qwen poses, solo on the GPU | ×2 | 3.0 |
| 36 LI5 on the re-cut showcase rigs; LI2 network capture; showcase gaze page re-check | `so-live-head-check.mts`, Sol rounds | Qwen frames (~16 GPU-min), browser | ×1 | 0.75 |
| 28 LT latency re-run (informational) | plan 28 driver | Artemis + SDXL/Qwen | ×1 | 0.5 |
| **Subtotal** | | | | **8.4** |

Excluded: campaign images (X6, 201 sets / ~35.8 h, on hold since 2026-10-15), GS5, 16-19 S28. 36 LI1 laptop and the
quiet-machine LI1 ×2 are browser/CPU rows, not GPU.

### 1.5 Other owed Artemis rows (were "beyond the cap"; the cap is gone)

| Row | Carrier | Runs | Wall h | Runs on |
|---|---|---|---|---|
| 62 Q1r (informational) | `so-qogre.mts run --relay none`, 5 cases × 4 replies | ×1 | 0.4 | either |
| 18 Q7 S7 | 18 §Phase Q7 | ×1 | 0.8 | either |
| 55 M7 | lab session, overdue commitment, 10 runs | ×1 | 0.5 | either (LT or RP) |
| 51 R7/R9, 53 F7 | **C:** need a lab story, or the owner accepting the adopted Saga as carrier | ×1 | 0.8 | either |
| 43 VR7/VR7p | **C:** W4/W4fi pass, then R-Gate2/3 | ×1 | 0.5 | either |
| **Subtotal** | | | **1.7 firm + 1.3 C** | |

Not GPU: R11 SP5 (dry-run captures, 0 pod minutes), 48 S7–S11 (Sol replay; S10 rides GS3), 62 Q1/Q2, 63 H6 (CL), 14 A7
(v2.9). 55 B and 56–59 are not built.

## 2. Two scenarios

Artemis work: 1.1 32.0 + 1.2 26.8 + 1.3 7.4 + 1.5 1.7 = **67.9 h** (+1.3 h conditional). Images: **8.4 h**.

### (A) Final suite on the 3090, pod-only measurements (and the blind arms) on a pod

- **3090: about 42 h.** Artemis 33.7 h (1.1 + 1.5) is 4–5 nights of 8 h. Images 8.4 h is one night.
- **Pod work: 34.2 h** (1.2 + 1.3), in 4 sessions: 4 × 0.75 fixed + 3.4 idle → **about 41 billed pod-hours, about
  USD 29** (EUR 27). Volume about USD 3.50 a month on top, already billed.
- Without the blind arms (D5/D6 rows only): 26.8 h of work, 3 sessions, **about 32 pod-hours, about USD 23**.
- Calendar: pod sessions on days (the 3090 stays the owner's), 3090 nights after. Never 2 + 2 model lanes at once.

### (B) Everything Artemis on pods, images on the 3090

- **Pod work: 67.4 h** (1.1 minus P7/P7h, + 1.2 + 1.3 + 1.5), in about 8 sessions of about 8.5 h: 8 × 0.75 + 6.7 idle →
  **about 80 billed pod-hours, about USD 58** (EUR 53). Volume about USD 3.50 a month, two months if it spans November.
- **3090: about 9 h** (images 8.4 + P7/P7h 0.5), one night.
- Frees about 4 owner nights. Costs about USD 29 more than A. Moves acceptance off the play route (§4).

Either scenario: +1.3 h (about USD 1) if the conditionals in 1.5 open. A fix during the suite re-freezes to F′ and re-runs
only the rows it reaches (70 rule 1). That is outside these totals and falls under the stop-and-ask threshold.

## 3. Recommended pod session plan (scenario A)

Order: P1 (measurements, no dependency on the suite), then P2/P3 (SP6), then P4 (blind arms; M24 waits for GS2's M21 from
the 3090). Each session is one pod: created at the start, terminated at the end, never left stopped (an EXITED pod can hold
its host GPU).

| Session | Carries | Lanes | Work h | Billed h (est.) | USD |
|---|---|---|---|---|---|
| P1 measurements | R7/PFX solo (`--swa-full`, 24576) → `so-pod pull` → restart without `--swa-full` → 63 H6r, then H1 front-trim, then `fits` solo (saga seed restored between) → restart at 98K unified, parallel 2 → B1-HIST ×2, control and 24576 arms on two lanes | 1 → 1 → 2 | 11.1 | 13.0 | 9.4 |
| P2 SP6 judge on | K3 release-on ×2 (lane A) ∥ control-on ×2 (lane B), consecutive on each lane | 2 | 7.8 | 9.3 | 6.7 |
| P3 SP6 judge off + K5 | K3 release-off ×2 ∥ control-off ×2, then K5 release ∥ control ×2 | 2 | 7.9 | 9.4 | 6.8 |
| P4 blind arms | B1-NARR run 2 (2 lanes) → B1-R4 ∥ 37-M3 → thinking A/B (`pull` before the model swap) → M24 if M21 is at floor | 2 | 7.4 | 8.9 | 6.4 |
| **Total** | | | **34.2** | **40.6** | **29.3** |

Per session, in this order:

1. **Before the pod exists:**
   - Owner go for the session.
   - BUDGET.md row with the estimate.
   - Lanes seeded (`adolion-fresh seed`, images and sprites off), snapshotted, and the run header captured locally on
     build F.
   - `df -h /c`; RAM headroom for two lanes.
   - The 3090 lanes stopped (machine-wide lane cap).
2. **Create:** Secure, EU-RO-1, RTX PRO 4500, volume `x9gi6f1rig`, env as pod 2 (`LLM_DEBUG_LOG=1`, `MAX_UPTIME_HOURS` =
   session estimate + 2, `IDLE_MINUTES` 30). Quote the hourly price first (RunPod MCP rule).
3. **Connect:** `so-pod.mts target <k>` + `so-pod.mts up <k>` (tunnel supervisor; health, metrics, slots, nvidia-smi and
   llama-server log every 15 s). Repoint the lane profiles to the tunnel port, recording the old `api-url`, re-select the
   profile, and run a `PONG` probe.
4. **Run:** rows through `st-lanes batch` (row dirs with `tunnel.json` + `pod.json`), at most 2 model lanes. Run solo rows
   (PFX/R7, H1/H6r) alone. `so-run-header diff --owned` after each batch. `so-pod pull <k>` before **every** llama-server
   restart (P1 has two, P4 one).
5. **Close:**
   - `so-pod pull <k>`, then `so-pod release <k>` must exit 0.
   - Terminate the pod, then verify with `list-pods` (only pods this work created).
   - Restore the profiles' `api-url`.
   - `so-evidence.mts archive --label gpu71-p<n>`, then `npm run sessions:archive` (commit in `so-sessions`).
   - BUDGET.md row: billed hours from pod billing.
   - Results into the source plans' Gate records (lists, no `| ID |` tables).

**Stop and ask** (stop the pod first, then ask):

- A session reaches 150 % of its billed estimate.
- Cumulative pod spend passes **USD 35** (A; 120 % of the plan) or **USD 70** (B).
- A row's first run is INCOMPLETE on a harness fault (fix locally before paying for a re-run).
- The pod sits idle more than 20 min with no row ready.
- TypeSafe passes 80 % of its call cap.
- An undeclared header diff.

## 4. Risks

- **Usage limits.**
  - Sol (raters, wizard rows, 47 P6, 48 replay, M24 rater) stopped a plan 33 leg. No Sol-bound row sits on a pod's
    critical path; packs are rated after the session.
  - TypeSafe cap 20,000 calls: plan 70 counts about 14,000. SP6's judge-on cells add about 4,700 (4 cells × 98 turns ×
    ~12), and B1-HIST and the D2 rows add more. **Expect to cross the cap.** Owner decision before P2.
  - The coordinating agent's own quota: v2.6 stopped mid-pod on quota. Keep the idle watchdog (`IDLE_MINUTES`), and stop
    the pod at every pause.
- **Pod unavailable.**
  - The volume pins EU-RO-1. RTX PRO 4500 capacity there has run out before (BUDGET 2026-10-01/03: host had no free GPU
    after a stop). Fix: a new pod on the same volume, same DC.
  - Fallback with the owner's OK: A100 80 GB at $1.59/h (used 2026-10-01; P1 would cost about USD 21).
  - Or move SP6, 63 and the blind arms to 3090 nights. R7/PFX and B1-HIST cannot move (VRAM).
- **Context differences.**
  - B1-HIST control at 98K needs a unified KV pool of at least 98,304 + 24,576 tokens, **without** `--swa-full`.
  - `--swa-full` runs only at 24576 on this card (R7/PFX, chat cut to 80 rows).
  - 63's arms assume ST 24576/32768 against a 32,768 server (the 3090). Run H1 with per-slot ctx 32768 on the pod, or
    record the deviation.
  - Pod numbers (prefill, first token, reuse) are pod numbers. 63 B and R7 decide on them, while the play route is the
    3090.
- **Acceptance off the play route (scenario B).** The pod serves bartowski's Q4_K_M, the 3090 TheDrummer's (X3). Pods
  bypass the controller gateway (X2's tokenize path, X1's 32K overflow handling). A green on the pod is a green on a
  different quant and route. Plan 70 defines RP as "the 3090 at 32K", so B must set the pod to 32768 per slot and record
  the deviation.
- **The 12 h Artemis cap is gone** (70 D1, owner 2026-10-17).
  - Nothing forces cuts any more, so spend is bounded only by the stop-and-ask line above and the owner's pause.
  - Triage loops (F → F′, each re-running reached rows ×2) are the open-ended part. Name the rows in the fix commit;
    re-estimate before each re-run block.
- **Budget rules in force.**
  - Plan 24: EUR 20 v2.8 RunPod cap, and every RP block written into BUDGET.md before it runs.
  - Gotchas: no RunPod for the rest of October 2026.
  - Both scenarios exceed EUR 20, so pods start in November or on an explicit owner go.
- **Local machine.**
  - Lanes and browsers for pod rows run on this PC (RAM; C: has hit 0 bytes during pod 2).
  - Never 2 + 2 model lanes.
  - Kill stuck drivers by process tree (`taskkill /T /F`).
- **Images.** Broker fair-window defaults (3 replies / 45 s) are unmeasured. The latency floor 1.10 missed ×3 before the
  fix (1.99, 2.21, 2.69). Host RAM below 12,235 MiB refuses Qwen leases (retryable now). Run the image night with no
  other agent's gates on the box.

## Decisions needed

1. **Scenario:** A (recommended: acceptance on the play route; pod only where the 3090 cannot reach or SP6's 15 h would
   take two nights) or B (frees about 4 nights, about USD 29 more).
2. **Pod budget:** raise plan 24's EUR 20 cap to about USD 35 for A (stop line) or USD 70 for B; November start vs an
   October exception.
3. **Blind arms on the pod (P4, about USD 6.4)** or 3090 nights / v2.9.
4. **TypeSafe cap** with SP6 judge-on cells: raise above 20,000 or run SP6 judge-on cells only after the suite's count is
   known.
5. **Thinking A/B candidate download** (about 14–19 GB onto the volume, the space check first).
6. **D2 scope:** confirm Artemis for all ~800 former-CL reply turns (about +13 h over plan 70's +2.2 h).

## Unresolved questions

1. 63 H1 on the pod vs plan 63's 3090 framing: is a pod latency result enough for 63's B decision, which is about the
   owner's route?
2. Do the 35-K3/K4/K5 `-C5` manifest ids accept the SP6 pair on F as their evidence (assumed), or need their own pair?
3. M24 has no measured timing; the 2 h is an estimate until a carrier is written.
4. R8's off-default arms have no protocol; add one or drop them to v2.9?

## Owner revision 2026-10-17

- Final suite cut to the lean set in plan 70 §Owner revision (about 5-6 h on the 3090, rows x1, no pod).
- Pod: measurement rows only (scenario A sessions P1-P4), on the owner's call; cloud reply rows move to v2.9.

## Owner arrangement 2026-10-17 (budget EUR 15 pod + 3090 nights; supersedes earlier pod scenarios)

- Part 1, v2.8:
  - Night 1, 3090 (~5-6 h): lean suite (plan 70 §Owner revision): GS1, GS6, 47 promises, T8, 45 seal, 42 W4 recorder (solo), 41 image journey x1, 33 latency pair x1 (solo).
  - One pod session, RTX PRO 4500 EU-RO-1 (~10-11 h billed, about USD 8 / EUR 7.5): R7/B1-PFX x1 solo (--swa-full at 24576), B1-HIST x1 (98K unified, no --swa-full), SP6 lean: release vs control, judge on, x1 each in parallel. Stop and ask at 150 % of estimate or EUR 12 cumulative.
  - Night 2, 3090 (~4-5 h): 63 H6r + H1 (play route), R5 B1-NARR run 2 x1.
  - Order: night 1 first; the pod session and night 2 are independent.
  - Single runs record as 'passed once, pair owed in v2.9' where a floor asks x2; SP6 PASS once is enough to start building 49 Phase 3.
- Part 2, v2.9: SP6 second runs, judge-off cells and K5; thinking A/B (needs a model download); B1-R4/37-M3; M24; 51 R7/R9, 53 F7; 43 VR7; all cloud-model rows.

