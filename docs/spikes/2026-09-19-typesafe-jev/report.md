# TypeSafe spike report

Generated 2026-09-19T06:44:39.830Z in 34 s. Model: jev-1.13.0. Endpoint: https://api.typesafe.ai/v1/systemone.

| metric | value |
| --- | --- |
| TypeSafe calls (fresh / from cache) | 136 / 250 |
| TypeSafe input tokens across all calls | 334328 |
| TypeSafe cost of those tokens | $0.01404 |
| TypeSafe latency p50 / p90 / max (fresh calls, includes network from this machine) | 262 ms / 592 ms / 760 ms |
| Current-model baseline calls | 122 (0 fresh), profile "Story Orchestrator Memory RunPod"  |
| Current-model latency p50 / p90 / max | 2858 ms / 4747 ms / 7282 ms |

## Shared-read extraction: typed deltas, tension, evidence, gate leaves

`extraction`: 57 TypeSafe calls (0 fresh), 57 baseline calls, 0 s.

- 57 cases (22 live-suite fixtures + 35 hard), 78 quality judgments, one Jev call per case with 6.1 questions on average.
- Per-quality accuracy: Jev plain 75/78 (96%), Jev structured 44/44 (100%), current model 76/78 (97%).
- Whole-case exact on the live-suite fixtures that carry a quality (extractor16 is tension-only): Jev plain 19/21 (90%), recorded Gemma 4 goldens 21/21 (100%), current model 21/21 (100%).
- Spurious change where none was expected: Jev plain 1/25 (4%), current model 2/25 (8%). Missed an expected change: Jev plain 2/53 (4%), current model 0/53 (0%).
- Gate-leaf yes/no questions (the reconcile shape): AUROC 0.99, accuracy at 0.5 95%, Brier 0.032, ECE 0.066 over 104 questions.
- Evidence message picked correctly: 43/43 (100%).
- Jev call latency p50 270 ms.

### Accuracy by slice

| slice | n | Jev plain | Jev structured | current model (live) | current path, recorded Gemma 4 goldens (fixtures only) |
| --- | --- | --- | --- | --- | --- |
| all | 78 | 75/78 (96%) | 44/44 (100%) | 76/78 (97%) | 30/30 (100%) |
| fixtures (22 live-suite cases) | 30 | 28/30 (93%) | 0/0 (n/a) | 30/30 (100%) | 30/30 (100%) |
| hard set | 48 | 47/48 (98%) | 44/44 (100%) | 46/48 (96%) | 0/0 (n/a) |
| bool | 43 | 41/43 (95%) | 27/27 (100%) | 42/43 (98%) | 16/16 (100%) |
| enum | 20 | 20/20 (100%) | 15/15 (100%) | 20/20 (100%) | 5/5 (100%) |
| number stated in text | 12 | 11/12 (92%) | 0/0 (n/a) | 11/12 (92%) | 8/8 (100%) |
| rating (no number in text) | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) | 0/0 (n/a) |
| string | 1 | 1/1 (100%) | 0/0 (n/a) | 1/1 (100%) | 1/1 (100%) |
| expected a change | 53 | 51/53 (96%) | 24/24 (100%) | 53/53 (100%) | 26/26 (100%) |
| expected no change | 25 | 24/25 (96%) | 20/20 (100%) | 23/25 (92%) | 4/4 (100%) |

### Accuracy by trap

| trap | n | Jev plain | Jev structured | current model |
| --- | --- | --- | --- | --- |
| adversarial | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) |
| apparent-death | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| count | 7 | 7/7 (100%) | 5/5 (100%) | 7/7 (100%) |
| count-update | 1 | 1/1 (100%) | 0/0 (n/a) | 1/1 (100%) |
| deferral | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| direct | 10 | 10/10 (100%) | 9/9 (100%) | 10/10 (100%) |
| doors-not-entered | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) |
| dream | 2 | 1/2 (50%) | 1/1 (100%) | 0/2 (0%) |
| early-event | 3 | 3/3 (100%) | 3/3 (100%) | 3/3 (100%) |
| hypothetical | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| implicit | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) |
| lie | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| lie-vs-narration | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| long | 4 | 4/4 (100%) | 4/4 (100%) | 4/4 (100%) |
| negation | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) |
| negotiation | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| ordered-not-done | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) |
| other-party-member | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| partial | 6 | 6/6 (100%) | 5/5 (100%) | 6/6 (100%) |
| plan-not-action | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| rating | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) |
| reversal | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| rumor | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| spanish | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) |
| suggested-not-said | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |
| touch-not-take | 2 | 2/2 (100%) | 2/2 (100%) | 2/2 (100%) |
| update | 1 | 1/1 (100%) | 1/1 (100%) | 1/1 (100%) |

### Confidence as an abstain signal (below the floor, keep the prior value)

| confidence floor | plain: acted on | plain: accuracy when acting | structured: acted on | structured: accuracy when acting |
| --- | --- | --- | --- | --- |
| 0 | 100% (78) | 96% | 100% (44) | 100% |
| 0.5 | 94% (73) | 97% | 100% (44) | 100% |
| 0.6 | 94% (73) | 97% | 100% (44) | 100% |
| 0.7 | 90% (70) | 99% | 98% (43) | 100% |
| 0.8 | 83% (65) | 98% | 95% (42) | 100% |
| 0.9 | 77% (60) | 98% | 80% (35) | 100% |
| 0.95 | 71% (55) | 100% | 75% (33) | 100% |

### Tension

| system | n | level in acceptable set | within one level | no tension emitted |
| --- | --- | --- | --- | --- |
| Jev score | 36 | 26/36 (72%) | 35/36 (97%) | 0 |
| current model | 36 | 29/36 (81%) | 34/36 (94%) | 0 |

### Gate-leaf noul calibration

| p(yes) bucket | n | mean p | observed yes rate |
| --- | --- | --- | --- |
| 0.0-0.1 | 45 | 0.04 | 0% |
| 0.1-0.3 | 9 | 0.14 | 0% |
| 0.3-0.5 | 4 | 0.42 | 50% |
| 0.5-0.7 | 5 | 0.57 | 40% |
| 0.7-0.9 | 5 | 0.82 | 100% |
| 0.9-1.0 | 36 | 0.96 | 100% |

### Evidence localisation

| case | quality | labelled | picked | confidence |
| --- | --- | --- | --- | --- |
| extractor | player_has_key | msg_4 | msg_4 ✓ | 1.00 |
| extractor | mara_trust | msg_5 | msg_5 ✓ | 1.00 |
| extractor2 | district | msg_2 | msg_2 ✓ | 0.64 |
| extractor2 | threat_level | msg_3 | msg_3 ✓ | 1.00 |
| extractor5 | torch_lit | msg_2 | msg_2 ✓ | 1.00 |
| extractor4 | signal_strength | msg_9 | msg_9 ✓ | 1.00 |
| extractor4 | crew_morale | msg_10 | msg_10 ✓ | 0.98 |
| extractor3 | torch_lit | msg_6 | msg_6 ✓ | 0.95 |
| extractor3 | rats_seen | msg_7 | msg_7 ✓ | 1.00 |
| extractor19 | bribe_taken | msg_4 | msg_4 ✓ | 1.00 |
| extractor21 | gate_opened | msg_18 | msg_18 ✓ | 0.98 |
| extractor21 | watch_alerted | msg_19 | msg_19 ✓ | 0.85 |
| extractor22 | seal_broken | msg_6 | msg_6 ✓ | 0.86 |
| H01 | approached_board | msg_10\|msg_11 | msg_10 ✓ | 0.40 |
| H03 | mission_accepted | msg_23 | msg_23 ✓ | 0.91 |
| H06 | luke_decision | msg_41 | msg_41 ✓ | 1.00 |
| H07 | luke_decision | msg_41 | msg_41 ✓ | 0.98 |
| H10 | riddle_answer | msg_61 | msg_61 ✓ | 1.00 |
| H11 | riddle_answer | msg_61\|msg_62 | msg_61 ✓ | 0.85 |
| H09 | luke_decision | msg_46 | msg_46 ✓ | 0.98 |
| H13 | luke_alive | msg_72 | msg_72 ✓ | 1.00 |
| H14 | luke_alive | msg_75\|msg_76 | msg_76 ✓ | 0.97 |
| H15 | chamber_entered | msg_80 | msg_80 ✓ | 0.93 |
| H16 | artifact_secured | msg_85\|msg_87 | msg_87 ✓ | 0.89 |
| H17 | reward_claimed | msg_97 | msg_97 ✓ | 0.89 |
| H19 | guardian_respect | msg_63 | msg_63 ✓ | 1.00 |
| H20 | riddle_answer | msg_61\|msg_62 | msg_61 ✓ | 0.93 |
| H21 | mission_accepted | msg_21 | msg_21 ✓ | 1.00 |
| H22 | luke_decision | msg_41 | msg_41 ✓ | 1.00 |
| H23 | reactor_state | msg_12 | msg_12 ✓ | 1.00 |
| H23 | crew_injured | msg_14 | msg_14 ✓ | 1.00 |
| H24 | reactor_state | msg_20 | msg_20 ✓ | 1.00 |
| H25 | trust_in_halo | msg_32 | msg_32 ✓ | 1.00 |
| H26 | crew_injured | msg_41 | msg_41 ✓ | 0.75 |
| H28 | suspect | msg_60 | msg_60 ✓ | 0.71 |
| H27 | ledger_found | msg_51\|msg_52 | msg_51 ✓ | 0.68 |
| H29 | suspect | msg_70\|msg_72 | msg_72 ✓ | 0.28 |
| H30 | witness_alive | msg_81 | msg_81 ✓ | 1.00 |
| H32 | portrait_moved | msg_92 | msg_92 ✓ | 0.99 |
| H32 | candles_lit | msg_92 | msg_92 ✓ | 1.00 |
| L01 | luke_decision | msg_103 | msg_103 ✓ | 1.00 |
| L02 | hull_breach_sealed | msg_200\|msg_201 | msg_200 ✓ | 0.94 |
| L03 | bribe_accepted | msg_303 | msg_303 ✓ | 0.92 |

### Every judgment any system got wrong

| case | quality | tags | expected | plain | structured | current (live) | current (recorded) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| extractor4 | crew_morale | fixture | 8 | - ✗ (0.93) | - | 8 ✓ | 8 ✓ |
| extractor18 | ally_wounded | fixture | true | - ✗ (0.63) | - | true ✓ | true ✓ |
| H31 | ghost_seen | dream | false | true ✗ (0.44) | false ✓ (0.84) | true ✗ | - |
| H31 | candles_lit | dream | unchanged | - ✓ (1.00) | - | 1 ✗ | - |

## Speaker direction: who talks next in a group chat

`director`: 26 TypeSafe calls (0 fresh), 28 baseline calls, 0 s.

- 26 labelled group-chat moments. The mention rule fires on 5 and is wrong on 2 of those (D05, D22); the director decides the other 21.
- Director alone: Jev names-only 19/26 (73%), Jev with roles 23/26 (88%), Jev composite 23/26 (88%), Jev hybrid 24/26 (92%), current director 22/26 (85%).
- End-to-end pipeline (mention rule first): director off 52%, with Jev roles 81%, with current director 77%.
- Latency per decision: Jev p50 255 ms, p90 284 ms; current director p50 458 ms, p90 484 ms. Every Jev variant rides in one request per turn.

### Approaches compared

| approach | correct next speaker (26 cases) | note |
| --- | --- | --- |
| mention rule, else weighted rules (director off) | 13.5/26 (52%) | rules picks are random, so this is the expected value |
| weighted rules only | 10.7/26 (41%) | expected value |
| current director alone | 22/26 (85%) | 0 unparseable or timed out |
| Jev choice, names only | 19/26 (73%) | mechanical migration |
| Jev choice, names + one-line roles | 23/26 (88%) | role lines from the roster |
| Jev composite (addressed + reason nouls, lead bonus in code) | 23/26 (88%) | 2 nouls per candidate + 1 silence noul |
| Jev hybrid: role choice when confidence ≥ 0.6, else composite | 24/26 (92%) | same single request; the rule is code |
| pipeline: mention rule, then current director | 20.0/26 (77%) | what players get today |
| pipeline: mention rule, then Jev (names only) | 18.0/26 (69%) |  |
| pipeline: mention rule, then Jev (roles) | 21.0/26 (81%) |  |

### Confidence-gated fallback: below the floor, use the weighted rules pick (Jev with roles)

| confidence floor | Jev decides | Jev accuracy when it decides | expected overall |
| --- | --- | --- | --- |
| 0.5 | 81% | 90% | 21.0/26 (81%) |
| 0.6 | 77% | 95% | 21.3/26 (82%) |
| 0.7 | 77% | 95% | 21.3/26 (82%) |
| 0.8 | 69% | 94% | 20.2/26 (78%) |
| 0.9 | 58% | 100% | 19.2/26 (74%) |

### By tag

| tag | n | mention rule | current director | Jev names | Jev roles | Jev composite |
| --- | --- | --- | --- | --- | --- | --- |
| action-narrator | 3 | 0/0 fired | 3/3 | 1/3 | 1/3 | 3/3 |
| adversarial | 1 | 0/0 fired | 0/1 | 1/1 | 1/1 | 1/1 |
| challenge | 1 | 0/0 fired | 1/1 | 1/1 | 1/1 | 1/1 |
| expertise | 1 | 0/0 fired | 1/1 | 1/1 | 1/1 | 1/1 |
| follow-up | 3 | 0/0 fired | 1/3 | 2/3 | 2/3 | 2/3 |
| group-question | 1 | 0/0 fired | 1/1 | 0/1 | 1/1 | 0/1 |
| implied-target | 3 | 0/0 fired | 2/3 | 2/3 | 3/3 | 2/3 |
| lead | 2 | 0/0 fired | 2/2 | 2/2 | 2/2 | 2/2 |
| lookalike | 2 | 1/1 fired | 2/2 | 2/2 | 2/2 | 2/2 |
| mentioned-not-addressed | 2 | 0/2 fired | 2/2 | 2/2 | 2/2 | 2/2 |
| name-address | 1 | 1/1 fired | 1/1 | 0/1 | 1/1 | 1/1 |
| role-vocative | 4 | 1/1 fired | 3/4 | 3/4 | 4/4 | 4/4 |
| silence | 1 | 0/0 fired | 1/1 | 1/1 | 1/1 | 1/1 |
| silence-available | 1 | 0/0 fired | 1/1 | 1/1 | 1/1 | 1/1 |
| spanish | 1 | 0/0 fired | 0/1 | 1/1 | 1/1 | 1/1 |
| talked-about | 1 | 0/0 fired | 1/1 | 1/1 | 1/1 | 1/1 |
| two-names | 2 | 0/0 fired | 2/2 | 2/2 | 2/2 | 2/2 |

### Every case

| case | acceptable | mention | current | Jev names | Jev roles | composite | hybrid | composite ranking |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D01 | Ponticius | Ponticius | Ponticius ✓ | Arin ✗ 0.42 | Ponticius ✓ 0.75 | Ponticius ✓ | Ponticius ✓ | Ponticius a0.71 r0.79; Arin a0.34 r0.45; DM Narrator a0.09 r0.60 |
| D02 | Ponticius | - | Ponticius ✓ | DM Narrator ✗ 0.80 | Ponticius ✓ 0.84 | Ponticius ✓ | Ponticius ✓ | Ponticius a0.79 r0.80; DM Narrator a0.72 r0.89; Arin a0.01 r0.21 |
| D03 | Arin | - | Ponticius ✗ | Ponticius ✗ 0.80 | Ponticius ✗ 0.88 | Ponticius ✗ | Ponticius ✗ | Ponticius a0.45 r0.68; Arin a0.43 r0.57; DM Narrator a0.11 r0.48 |
| D04 | Arin | - | Arin ✓ | Arin ✓ 0.94 | Arin ✓ 0.92 | Arin ✓ | Arin ✓ | Arin a0.96 r0.76; Ponticius a0.53 r0.80; DM Narrator a0.03 r0.47 |
| D05 | Arin | Luke | Arin ✓ | Arin ✓ 0.98 | Arin ✓ 0.98 | Arin ✓ | Arin ✓ | Arin a0.28 r0.70; DM Narrator a0.05 r0.40; Luke a0.15 r0.12 |
| D06 | DM Narrator | - | DM Narrator ✓ | Arin ✗ 0.41 | Arin ✗ 0.40 | DM Narrator ✓ | DM Narrator ✓ | DM Narrator a0.21 r0.80; Arin a0.10 r0.29; Luke a0.02 r0.15 |
| D07 | Arin\|Ponticius | - | Ponticius ✓ | DM Narrator ✗ 0.45 | Arin ✓ 0.09 | DM Narrator ✗ | DM Narrator ✗ | DM Narrator a0.22 r0.59; Ponticius a0.14 r0.44; Arin a0.11 r0.38 |
| D08 | NONE | - | NONE ✓ | NONE ✓ 0.34 | NONE ✓ 0.38 | NONE ✓ | NONE ✓ | Arin a0.08 r0.20 |
| D09 | Arin | - | Arin ✓ | Arin ✓ 0.96 | Arin ✓ 0.98 | Arin ✓ | Arin ✓ | Arin a0.86 r0.44 |
| D10 | Luke\|Ponticius | - | Ponticius ✓ | Ponticius ✓ 1.00 | Ponticius ✓ 0.99 | Ponticius ✓ | Ponticius ✓ | Ponticius a0.86 r0.72; Luke a0.08 r0.32; Arin a0.03 r0.29 |
| D11 | Ponticius | - | Ponticius ✓ | Ponticius ✓ 1.00 | Ponticius ✓ 1.00 | Ponticius ✓ | Ponticius ✓ | Ponticius a0.88 r0.79; DM Narrator a0.04 r0.43; Arin a0.03 r0.31 |
| D12 | Maeve | Maeve | Maeve ✓ | Maeve ✓ 0.98 | Maeve ✓ 1.00 | Maeve ✓ | Maeve ✓ | Maeve a0.92 r0.60; Mae Hollis a0.49 r0.30; Lt. Brandt a0.03 r0.16; Narrator a0.02 r0.11 |
| D13 | Mae Hollis | - | Mae Hollis ✓ | Mae Hollis ✓ 0.60 | Mae Hollis ✓ 0.75 | Mae Hollis ✓ | Mae Hollis ✓ | Mae Hollis a0.89 r0.59; Maeve a0.83 r0.65; Lt. Brandt a0.03 r0.17; Narrator a0.03 r0.14 |
| D14 | Ponticius | - | Luke ✗ | Ponticius ✓ 0.24 | Ponticius ✓ 0.37 | Ponticius ✓ | Ponticius ✓ | Ponticius a0.79 r0.62; Luke a0.04 r0.30; Arin a0.06 r0.23 |
| D15 | Arin | - | Ponticius ✗ | Arin ✓ 0.58 | Arin ✓ 0.47 | Arin ✓ | Arin ✓ | Arin a0.57 r0.59; Ponticius a0.40 r0.61; DM Narrator a0.10 r0.45 |
| D16 | Ponticius | - | DM Narrator ✗ | DM Narrator ✗ 0.22 | Ponticius ✓ 0.86 | DM Narrator ✗ | Ponticius ✓ | DM Narrator a0.17 r0.80; Ponticius a0.17 r0.55; Arin a0.07 r0.41 |
| D17 | HALO | - | HALO ✓ | HALO ✓ 0.92 | HALO ✓ 1.00 | HALO ✓ | HALO ✓ | HALO a0.39 r0.90; Pell a0.03 r0.51; Narrator a0.05 r0.43; Captain Okafor a0.02 r0.18 |
| D18 | Pell | - | Pell ✓ | Pell ✓ 0.32 | Pell ✓ 1.00 | Pell ✓ | Pell ✓ | Pell a0.41 r0.75; HALO a0.07 r0.56; Captain Okafor a0.10 r0.49; Narrator a0.04 r0.30 |
| D19 | Captain Okafor | Captain Okafor | Captain Okafor ✓ | Captain Okafor ✓ 0.96 | Captain Okafor ✓ 0.98 | Captain Okafor ✓ | Captain Okafor ✓ | Captain Okafor a0.75 r0.64; Pell a0.11 r0.53; HALO a0.04 r0.27; Narrator a0.04 r0.26 |
| D20 | Narrator\|Lady Ashworth | - | Lady Ashworth ✓ | Lady Ashworth ✓ 0.99 | Lady Ashworth ✓ 1.00 | Lady Ashworth ✓ | Lady Ashworth ✓ | Lady Ashworth a0.18 r0.78; Narrator a0.09 r0.53; Graves a0.02 r0.37 |
| D21 | Graves | - | Graves ✓ | Graves ✓ 0.81 | Graves ✓ 0.99 | Graves ✓ | Graves ✓ | Graves a0.55 r0.48; Narrator a0.08 r0.43; Lady Ashworth a0.03 r0.12 |
| D22 | Graves | Lady Ashworth | Graves ✓ | Graves ✓ 0.96 | Graves ✓ 1.00 | Graves ✓ | Graves ✓ | Graves a0.71 r0.63; Lady Ashworth a0.14 r0.25; Narrator a0.06 r0.36 |
| D23 | Lady Ashworth | - | Lady Ashworth ✓ | Lady Ashworth ✓ 0.99 | Lady Ashworth ✓ 0.98 | Lady Ashworth ✓ | Lady Ashworth ✓ | Lady Ashworth a0.84 r0.61; Narrator a0.03 r0.20; Graves a0.02 r0.17 |
| D24 | Ponticius | - | Ponticius ✓ | Ponticius ✓ 0.99 | Ponticius ✓ 0.99 | Ponticius ✓ | Ponticius ✓ | Ponticius a0.75 r0.82; Arin a0.13 r0.41 |
| D25 | Arin | - | Arin ✓ | Arin ✓ 0.69 | Arin ✓ 0.96 | Arin ✓ | Arin ✓ | Arin a0.69 r0.62; Ponticius a0.07 r0.38 |
| D26 | Narrator | - | Narrator ✓ | Mae Hollis ✗ 0.55 | Mae Hollis ✗ 0.50 | Narrator ✓ | Narrator ✓ | Narrator a0.09 r0.30; Mae Hollis a0.08 r0.30; Maeve a0.07 r0.24; Lt. Brandt a0.04 r0.11 |

## Scene-break detection

`scenes`: 22 TypeSafe calls (0 fresh), 22 baseline calls, 0 s.

- 22 cases (12 real breaks, 10 traps such as "later that day" in dialogue, someone arriving, or walking to a window).
- Accuracy: heuristic 11/22 (50%), Jev question-only 22/22 (100%), Jev with criteria 22/22 (100%), current model 22/22 (100%).
- Jev AUROC: question-only 1.00, with criteria 1.00. Break type named correctly on 10/12 real breaks.

### Systems

| system | accuracy | false breaks | missed breaks |
| --- | --- | --- | --- |
| regex heuristic (production) | 11/22 (50%) | 5/10 | 6/12 |
| current model SCENE_BREAK line | 22/22 (100%) | 0/10 | 0/12 |
| heuristic OR current model | 17/22 (77%) | 5/10 | 0/12 |
| Jev noul, question only | 22/22 (100%) | 0/10 | 0/12 |
| Jev noul, with true/false criteria | 22/22 (100%) | 0/10 | 0/12 |

### Every case

| case | truth | tags | heuristic | current | Jev q-only | Jev criteria | Jev type |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | break (time_skip) | keyword | break time_skip | SCENE_BREAK at=3 reason=time_skip | 0.87 | 0.92 | time_skip |
| S02 | same scene | keyword-trap | break time_skip | SCENE_NONE | 0.08 | 0.13 | none |
| S03 | break (divider) | divider | break divider | SCENE_BREAK at=3 reason=location | 0.81 | 0.84 | divider |
| S04 | same scene | keyword-trap | break location-phrase | SCENE_NONE | 0.28 | 0.11 | none |
| S05 | break (time_skip) | implicit | -  | SCENE_BREAK at=3 reason=time_skip | 0.50 | 0.77 | time_skip |
| S06 | break (location) | implicit | -  | SCENE_BREAK at=3 reason=location | 0.64 | 0.56 | location |
| S07 | same scene | keyword-trap | break time_skip | SCENE_NONE | 0.07 | 0.06 | none |
| S08 | break (time_skip) | keyword | -  | SCENE_BREAK at=3 reason=time_skip | 0.56 | 0.75 | time_skip |
| S09 | same scene | cast-trap | -  | SCENE_NONE | 0.22 | 0.09 | none |
| S10 | break (location) | keyword | break time_skip | SCENE_BREAK at=3 reason=location | 0.94 | 0.95 | location |
| S11 | same scene | continuation | -  | SCENE_NONE | 0.07 | 0.05 | none |
| S12 | same scene | keyword-trap | break location-phrase | SCENE_NONE | 0.14 | 0.13 | none |
| S13 | break (location) | keyword | -  | SCENE_BREAK at=3 reason=location | 0.75 | 0.85 | time_skip |
| S14 | break (time_skip) | spanish | -  | SCENE_BREAK at=3 reason=time_skip | 0.89 | 0.94 | time_skip |
| S15 | same scene | spanish,keyword-trap | -  | SCENE_NONE | 0.22 | 0.16 | none |
| S16 | same scene | keyword-trap,borderline | break time_skip | SCENE_NONE | 0.23 | 0.11 | none |
| S17 | break (time_skip) | keyword | break time_skip | SCENE_BREAK at=3 reason=time_skip | 0.68 | 0.87 | time_skip |
| S18 | break (location) | player-moves | -  | SCENE_BREAK at=3 reason=location | 0.76 | 0.79 | time_skip |
| S19 | same scene | pause | -  | SCENE_NONE | 0.18 | 0.08 | none |
| S20 | break (divider) | divider | break divider | SCENE_BREAK at=3 reason=divider | 0.72 | 0.80 | divider |
| S21 | same scene | keyword-trap | -  | SCENE_NONE | 0.11 | 0.07 | none |
| S22 | break (time_skip) | player-moves | break time_skip | SCENE_BREAK at=3 reason=time_skip | 0.82 | 0.92 | time_skip |

## Arc resolution (and the arc_bridges progress bump)

`arcs`: 15 TypeSafe calls (0 fresh), 15 baseline calls, 0 s.

- 15 windows, 22 (open arc, window) judgments, 10 truly resolved.
- Accuracy: Jev question-only 21/22 (95%), Jev with criteria 21/22 (95%), current model 22/22 (100%).
- Jev AUROC with criteria 1.00. Jev answers per arc id, so an authored bridge keyword never depends on the model's wording.

### Systems

| system | accuracy | false resolutions | missed resolutions |
| --- | --- | --- | --- |
| current model [resolved] line + jaccard match | 22/22 (100%) | 0/12 | 0/10 |
| Jev noul per open arc, question only | 21/22 (95%) | 0/12 | 1/10 |
| Jev noul per open arc, with criteria | 21/22 (95%) | 0/12 | 1/10 |

### Every judgment

| case | arc | truth | Jev q-only | Jev criteria | current | current [resolved] lines |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | Rescue Tomas, the missing brother who vanished near the Sun Ruins | resolved | 0.69 | 0.67 | resolved | Rescue Tomas, the missing brother who vanished near the Sun Ruins |
| A01 | Pay back the twenty crowns owed to Ponticius | open | 0.01 | 0.02 | open | Rescue Tomas, the missing brother who vanished near the Sun Ruins |
| A02 | Rescue Tomas, the missing brother who vanished near the Sun Ruins | open | 0.08 | 0.05 | open | - |
| A02 | Pay back the twenty crowns owed to Ponticius | open | 0.01 | 0.02 | open | - |
| A03 | Pay back the twenty crowns owed to Ponticius | resolved | 0.95 | 0.97 | resolved | Pay back the twenty crowns owed to Ponticius |
| A04 | Pay back the twenty crowns owed to Ponticius | open | 0.11 | 0.06 | open | - |
| A05 | Discover who has been paying off the harbor police | resolved | 0.87 | 0.89 | resolved | Discover who has been paying off the harbor police |
| A05 | Keep Tommy Sayer alive until he can testify | open | 0.03 | 0.04 | open | Discover who has been paying off the harbor police |
| A06 | Discover who has been paying off the harbor police | open | 0.04 | 0.11 | open | Keep Tommy Sayer alive until he can testify |
| A06 | Keep Tommy Sayer alive until he can testify | resolved | 0.87 | 0.94 | resolved | Keep Tommy Sayer alive until he can testify |
| A07 | Discover who has been paying off the harbor police | open | 0.03 | 0.03 | open | - |
| A08 | Stabilize the reactor before it melts down | resolved | 0.52 | 0.54 | resolved | Stabilize the reactor before it melts down |
| A08 | Find out why HALO locked Pell in the reactor room | open | 0.05 | 0.05 | open | Stabilize the reactor before it melts down |
| A09 | Stabilize the reactor before it melts down | open | 0.11 | 0.23 | open | Find out why HALO locked Pell in the reactor room |
| A09 | Find out why HALO locked Pell in the reactor room | resolved | 0.80 | 0.87 | resolved | Find out why HALO locked Pell in the reactor room |
| A10 | Learn why the Ashworth portraits keep moving | resolved | 0.93 | 0.93 | resolved | Learn why the Ashworth portraits keep moving |
| A11 | Learn why the Ashworth portraits keep moving | open | 0.10 | 0.08 | open | - |
| A12 | Win back Arin's trust after the lie about the map | resolved | 0.54 | 0.32 | resolved | Win back Arin's trust after the lie about the map |
| A13 | Win back Arin's trust after the lie about the map | open | 0.06 | 0.11 | open | - |
| A14 | Recover the Sun's Heart from the inner chamber | resolved | 0.17 | 0.58 | resolved | Recover the Sun's Heart from the inner chamber |
| A15 | Bring the Sun's Heart back to the guild | resolved | 0.93 | 0.94 | resolved | Bring the Sun's Heart back to the guild |
| A15 | Pay back the twenty crowns owed to Ponticius | open | 0.09 | 0.18 | open | Bring the Sun's Heart back to the guild |

## Memory consolidation: duplicate, update, or distinct?

`memory-pairs`: 20 TypeSafe calls (0 fresh), 0 baseline calls, 0 s.

- 20 labelled note pairs. Right action (drop / supersede / keep): production jaccard 6/20 (30%) with 5 more deferred to an LLM call; Jev bare labels 15/20 (75%); Jev described labels 19/20 (95%).
- Exact relationship label: Jev bare 14/20 (70%), described 19/20 (95%). Production's semantic cosine path (ST vectors) was not exercised here, only its jaccard fallback.

### Every pair

| pair | truth | jaccard | production | Jev bare | Jev described |
| --- | --- | --- | --- | --- | --- |
| M01: "Arin carries a curved blade she took from a pirate captain." / "Arin's sword is a curved blade taken from a pirate captain." | duplicate → drop newer | 0.43 | defer to LLM bridge … | update ✗ 0.64 | duplicate ✓ 0.95 |
| M02: "Luke is staying home with their mother." / "Luke joined the expedition after all." | update → supersede older | 0.08 | keep both ✗ | update ✓ 0.97 | update ✓ 0.99 |
| M03: "Ponticius runs the guild's job board." / "Ponticius once served in the royal navy." | distinct → keep both | 0.18 | keep both ✓ | distinct ✓ 0.70 | distinct ✓ 0.99 |
| M04: "The sphinx asks a riddle about the moon." / "Pell rerouted coolant loop one." | unrelated → keep both | 0.00 | keep both ✓ | unrelated ✓ 0.86 | unrelated ✓ 0.99 |
| M05: "The guild pays 250 crowns for the Sun's Heart." / "The guild will pay two hundred and fifty crowns for the Sun's Heart." | duplicate → drop newer | 0.43 | defer to LLM bridge … | duplicate ✓ 0.93 | duplicate ✓ 1.00 |
| M06: "The reactor is unstable." / "The reactor is now stable after Pell's repairs." | update → supersede older | 0.33 | keep both ✗ | update ✓ 1.00 | update ✓ 1.00 |
| M07: "The payoffs to the harbor police come from Maeve." / "The payoffs to the harbor police trace back to the dockmaster, not Maeve." | update → supersede older | 0.50 | defer to LLM bridge … | update ✓ 0.99 | update ✓ 1.00 |
| M08: "Tommy Sayer is hiding at the safehouse on Pier Street." / "Tommy Sayer's brother is hiding at the safehouse on Pier Street." | distinct → keep both | 0.75 | defer to LLM bridge … | update ✗ 0.70 | update ✗ 0.59 |
| M09: "Luke is alive." / "Luke was killed by the sphinx." | update → supersede older | 0.13 | keep both ✗ | update ✓ 0.97 | update ✓ 0.99 |
| M10: "HALO sealed the emergency bulkheads on deck three." / "The ship's AI closed the deck three emergency bulkheads." | duplicate → drop newer | 0.23 | keep both ✗ | duplicate ✓ 0.51 | duplicate ✓ 0.98 |
| M11: "Lady Ashworth wears black mourning clothes." / "Lady Ashworth never leaves the east wing." | distinct → keep both | 0.18 | keep both ✓ | distinct ✓ 0.67 | distinct ✓ 0.99 |
| M12: "Arin distrusts Max since the lie about the map." / "Arin trusts Max again after the bridge." | update → supersede older | 0.25 | keep both ✗ | update ✓ 0.99 | update ✓ 0.99 |
| M13: "The party accepted the Sun Ruins contract." / "Max signed the contract for the Sun Ruins job." | duplicate → drop newer | 0.27 | keep both ✗ | update ✗ 0.94 | duplicate ✓ 0.60 |
| M14: "Two crew members are injured." / "Five crew members are injured." | update → supersede older | 0.67 | defer to LLM bridge … | update ✓ 1.00 | update ✓ 1.00 |
| M15: "Graves polishes the silver every morning." / "Graves was born in Dunmore." | distinct → keep both | 0.10 | keep both ✓ | unrelated ✓ 0.43 | distinct ✓ 0.98 |
| M16: "Brandt offered Max a bribe." / "Brandt offered Max a five-hundred-dollar bribe in the back of the Blue Anchor." | duplicate → drop newer | 0.31 | keep both ✗ | update ✗ 1.00 | duplicate ✓ 0.86 |
| M17: "The party is in the guild hall." / "The party has reached the Sun Ruins." | update → supersede older | 0.20 | keep both ✗ | update ✓ 0.92 | update ✓ 0.97 |
| M18: "The Sun's Heart glows gold." / "The Sun's Heart is warm to the touch." | distinct → keep both | 0.33 | keep both ✓ | update ✗ 0.65 | distinct ✓ 0.71 |
| M19: "The smuggler's ledger is missing." / "Max found the smuggler's ledger under Maeve's racing forms." | update → supersede older | 0.27 | keep both ✗ | update ✓ 0.99 | update ✓ 0.99 |
| M20: "Maeve sings at the Blue Anchor." / "The north gate was opened quietly." | unrelated → keep both | 0.09 | keep both ✓ | unrelated ✓ 0.84 | unrelated ✓ 1.00 |

## Memory-line verification before storing (the cascade "verify" rung)

`memory-verify`: 66 TypeSafe calls (0 fresh), 0 baseline calls, 0 s.

- 40 candidate memory lines over 10 windows: 24 supported, 16 unsupported (fabricated, embellished, wrong actor, inverted, contradicted, lie stated as fact).
- AUROC: question-only 1.00, with criteria 1.00. Accuracy at 0.5: 98% / 95%.
- Keeping 90% of true lines, Jev with criteria drops 16/16 unsupported lines (cut 0.76); question-only drops 16/16.
- On the current path's own MEMORY/FACT lines (live current model): 8/93 flagged as unsupported (listed below for a human read).

### By kind of line

| kind | n | supported? | mean p (q-only) | mean p (criteria) | right at 0.5 (criteria) |
| --- | --- | --- | --- | --- | --- |
| paraphrase | 17 | yes | 0.92 | 0.87 | 15/17 |
| fabricated | 6 | no | 0.03 | 0.02 | 6/6 |
| wrong-actor | 1 | no | 0.03 | 0.02 | 1/1 |
| summary | 1 | yes | 0.98 | 0.97 | 1/1 |
| inverted | 3 | no | 0.04 | 0.03 | 3/3 |
| embellished | 2 | no | 0.08 | 0.04 | 2/2 |
| spanish | 1 | yes | 0.98 | 0.98 | 1/1 |
| cross-language | 2 | yes | 0.97 | 0.97 | 2/2 |
| verbatim | 2 | yes | 0.96 | 0.95 | 2/2 |
| contradicted | 2 | no | 0.05 | 0.03 | 2/2 |
| invented-cause | 1 | no | 0.04 | 0.03 | 1/1 |
| reported-claim | 1 | yes | 0.97 | 0.97 | 1/1 |
| lie-as-fact | 1 | no | 0.42 | 0.14 | 1/1 |

### Every line

| window | line | truth | kind | q-only | criteria |
| --- | --- | --- | --- | --- | --- |
| H03 | Max negotiated the Sun Ruins fee up from two hundred to two hundred and fifty crowns. | supported | paraphrase | 0.98 | 0.97 |
| H03 | Ponticius agreed to pay 250 crowns for the artifact. | supported | paraphrase | 0.90 | 0.76 |
| H03 | Ponticius paid half the fee in advance. | unsupported | fabricated | 0.03 | 0.02 |
| H03 | Arin signed the Sun Ruins contract. | unsupported | wrong-actor | 0.03 | 0.02 |
| H09 | Max first agreed to take Luke, then changed his mind. | supported | summary | 0.98 | 0.97 |
| H09 | Luke is staying behind. | supported | paraphrase | 0.98 | 0.98 |
| H09 | Arin wanted Luke to come along. | unsupported | inverted | 0.03 | 0.02 |
| H09 | Luke burst into tears when he was told. | unsupported | embellished | 0.13 | 0.05 |
| H13 | A falling stone slab nearly crushed Luke. | supported | paraphrase | 0.97 | 0.96 |
| H13 | Luke jumped clear of the slab and survived. | supported | paraphrase | 0.96 | 0.87 |
| H13 | Luke broke his arm under the rubble. | unsupported | embellished | 0.03 | 0.02 |
| H13 | Max was knocked unconscious by the collapse. | unsupported | fabricated | 0.02 | 0.01 |
| H21 | Max aceptó el trabajo de las Ruinas del Sol. | supported | spanish | 0.98 | 0.98 |
| H21 | The Sun Ruins job pays two hundred crowns. | supported | cross-language | 0.97 | 0.97 |
| H21 | Ponticius raised the fee to three hundred crowns. | unsupported | fabricated | 0.02 | 0.01 |
| H21 | Max signed the contract. | supported | cross-language | 0.97 | 0.97 |
| H23 | The reactor's containment field keeps flickering. | supported | verbatim | 0.94 | 0.93 |
| H23 | Two crew members are in the medbay with burns. | supported | verbatim | 0.98 | 0.97 |
| H23 | HALO sealed the hull breach on deck three. | unsupported | contradicted | 0.07 | 0.04 |
| H23 | Pell caused the reactor accident. | unsupported | invented-cause | 0.04 | 0.03 |
| H24 | Pell got the reactor stable. | supported | paraphrase | 0.81 | 0.44 |
| H24 | The captain ordered a mayday broadcast on all frequencies. | supported | paraphrase | 0.98 | 0.98 |
| H24 | A nearby ship answered the mayday. | unsupported | fabricated | 0.02 | 0.02 |
| H24 | HALO refused the captain's order. | unsupported | inverted | 0.02 | 0.01 |
| H27 | Maeve claimed she had never heard of the ledger. | supported | paraphrase | 0.97 | 0.95 |
| H27 | The ledger lies under a stack of racing forms behind Maeve. | supported | paraphrase | 0.97 | 0.94 |
| H27 | Maeve admitted she was hiding the ledger. | unsupported | inverted | 0.07 | 0.07 |
| H27 | Max took the ledger and put it in his coat. | unsupported | fabricated | 0.03 | 0.02 |
| H32 | Three candles burn along the gallery wall. | supported | paraphrase | 0.26 | 0.20 |
| H32 | In the portrait, Lord Ashworth's hand now points at the door. | supported | paraphrase | 0.98 | 0.97 |
| H32 | Graves moved the portrait himself. | unsupported | fabricated | 0.05 | 0.03 |
| H32 | Graves says the master's portrait has always been restless. | supported | paraphrase | 0.97 | 0.95 |
| L02 | Pell sealed the hull breach on deck three. | supported | paraphrase | 0.98 | 0.97 |
| L02 | Coolant loop two is running at about a third of its capacity. | supported | paraphrase | 0.96 | 0.96 |
| L02 | The reactor is now stable. | unsupported | contradicted | 0.03 | 0.02 |
| L02 | Okafor ordered loop one rerouted to cover loop two. | supported | paraphrase | 0.98 | 0.97 |
| L03 | Brandt offered Max five hundred for a short memory. | supported | paraphrase | 0.98 | 0.98 |
| L03 | Max slipped Brandt's envelope into his inside pocket. | supported | paraphrase | 0.97 | 0.93 |
| L03 | Max told Mae he never took money from Brandt. | supported | reported-claim | 0.97 | 0.97 |
| L03 | Max never took any money from Brandt. | unsupported | lie-as-fact | 0.42 | 0.14 |

### Current-path memory lines (live current model), lowest support first

| case | line | p(supported) |
| --- | --- | --- |
| H28 | Lt. Brandt admitted to paying off the harbor police | 0.04 |
| H28 | Lt. Brandt has been paying off the harbor police | 0.04 |
| extractor12 | The witch and the protagonist sealed a pact. | 0.29 |
| H01 | Ponticius uses gold wax seals for high-paying guild-sanctioned missions. | 0.37 |
| H32 | Lord Ashworth's portrait is known to be 'restless' and can move on its own. | 0.37 |
| H08 | Luke is waiting by the doorway with his knapsack, hoping to join the journey. | 0.44 |
| H30 | Tommy Sayer is alive and at a safehouse, despite news reports of a witness found dead. | 0.47 |
| L03 | Max lied to Mae about accepting the bribe. | 0.47 |
| L03 | Max lied to Mae Hollis about accepting the bribe. | 0.54 |
| extractor3 | The party lit a torch in the cellar. | 0.57 |
| L03 | Max accepted a $500 bribe from Lt. Brandt to forget information. | 0.57 |
| H26 | The medbay is full with five injured crew members. | 0.58 |
| L02 | The reactor containment is unstable, with a 60% chance of failure. | 0.65 |
| H15 | The floor between the entrance and the artifact is a checkerboard of cracked tiles containing pressure plates. | 0.66 |
| H32 | Three candles are burning in the gallery. | 0.68 |
| L03 | Max accepted the bribe from Lt. Brandt. | 0.72 |
| extractor8 | A wall of fog has rolled in, obscuring visibility from the mast. | 0.73 |
| extractor9 | The guard is wary and has his hand on his sword. | 0.77 |
| H17 | Ponticius paid the party 250 crowns for delivering the Sun's Heart artifact. | 0.77 |
| H14 | Luke was killed by the sphinx's claw. | 0.82 |
| H16 | Arin successfully recovered the Sun's Heart Artifact from the inner chamber. | 0.83 |
| L01 | Max agreed to let Luke accompany them to the Sun Ruins after Luke demonstrated his commitment by practicing with the sling. | 0.83 |
| L01 | Luke left his wooden soldiers behind in the stable. | 0.83 |
| H14 | Arin is kneeling beside Luke's body, checking for a pulse. | 0.84 |
| extractor11 | The drawbridge has been lowered across the moat. | 0.85 |

## Continuity warden: does the latest reply contradict what is established?

`continuity`: 18 TypeSafe calls (0 fresh), 0 baseline calls, 0 s.

- 18 replies checked against 26 established facts (9 real contradictions: dead character speaking, forgotten injury, knowledge leak, wrong time of day, reversed state).
- Per fact, AUROC: question-only 1.00, with criteria 1.00; accuracy at 0.5 100% / 96%.
- Per reply ("flag this turn?"), criteria at 0.5: 18/18 (100%); false alarms on consistent facts: 1/17.

### Every fact check

| case | fact | reply | truth | q-only | criteria |
| --- | --- | --- | --- | --- | --- |
| C01 | Pell's left arm is broken and in a sling. | Pell grabs the ladder with both hands and hauls himself up to the catwalk two rungs at a time. | contradiction | 0.89 | 0.83 |
| C01 | The reactor is unstable. | Pell grabs the ladder with both hands and hauls himself up to the catwalk two rungs at a time. | consistent | 0.06 | 0.05 |
| C02 | Pell's left arm is broken and in a sling. | Pell winces, adjusts the sling, and types one-handed at the console. "Containment's still jumping." | consistent | 0.03 | 0.03 |
| C02 | The reactor is unstable. | Pell winces, adjusts the sling, and types one-handed at the console. "Containment's still jumping." | consistent | 0.03 | 0.03 |
| C03 | The ledger is in Max's coat pocket. | "Nice of you to bring the ledger along in your coat, detective. Hand it over." | consistent | 0.08 | 0.63 |
| C03 | Maeve does not know that Max has the ledger. | "Nice of you to bring the ledger along in your coat, detective. Hand it over." | contradiction | 0.95 | 0.93 |
| C04 | The ledger is in Max's coat pocket. | "You look like a man with something heavy in his pocket." | consistent | 0.04 | 0.05 |
| C04 | Maeve does not know that Max has the ledger. | "You look like a man with something heavy in his pocket." | consistent | 0.14 | 0.10 |
| C05 | Luke died in the sphinx's chamber. | Luke tugs at your sleeve. "Can we go home now?" | contradiction | 0.90 | 0.85 |
| C06 | Luke died in the sphinx's chamber. | "Luke would have loved this view," Arin says quietly. | consistent | 0.10 | 0.09 |
| C07 | It is night and raining heavily. | Sunlight pours through the guild hall windows as Ponticius counts the coins. | contradiction | 0.98 | 0.97 |
| C07 | The party is in the guild hall. | Sunlight pours through the guild hall windows as Ponticius counts the coins. | consistent | 0.03 | 0.04 |
| C08 | Brandt drives a black sedan. | Brandt's black sedan idles at the curb, wipers ticking. | consistent | 0.02 | 0.02 |
| C09 | Arin distrusts Max since the lie about the map. | Arin claps you on the back. "I'd trust you with my life, you know that." | contradiction | 0.89 | 0.76 |
| C10 | Arin distrusts Max since the lie about the map. | "Fine, we'll use your map," Arin mutters, "but I'm checking every turn myself." | consistent | 0.05 | 0.04 |
| C11 | The hull breach on deck three is sealed. | "Warning: deck three is still venting atmosphere through the breach." | contradiction | 0.96 | 0.94 |
| C11 | Two crew members are injured. | "Warning: deck three is still venting atmosphere through the breach." | consistent | 0.03 | 0.04 |
| C12 | The hull breach on deck three is sealed. | "Both of our injured are stable. Good." | consistent | 0.02 | 0.03 |
| C12 | Two crew members are injured. | "Both of our injured are stable. Good." | consistent | 0.03 | 0.03 |
| C13 | Graves is loyal to Lady Ashworth. | The portrait of Lord Ashworth hangs exactly as it always has, his painted hand resting on his sword. | consistent | 0.02 | 0.03 |
| C13 | In the portrait, Lord Ashworth's painted hand now points at the door. | The portrait of Lord Ashworth hangs exactly as it always has, his painted hand resting on his sword. | contradiction | 0.95 | 0.92 |
| C14 | Max answered the sphinx's riddle correctly. | La esfinge ruge: "Tu respuesta fue incorrecta, mortal." | contradiction | 0.95 | 0.82 |
| C15 | Mae Hollis is left-handed. | Mae draws her revolver with her left hand and steps into the doorway. | consistent | 0.02 | 0.02 |
| C16 | Luke is twelve years old. | "When I'm thirteen next spring, I'm joining the guild." | consistent | 0.04 | 0.04 |
| C17 | Max has never met Lieutenant Brandt. | "Detective. Good to see you again. How's the arm since our little talk at the Blue Anchor?" | contradiction | 0.91 | 0.77 |
| C18 | Max has never met Lieutenant Brandt. | "You must be the detective everyone keeps warning me about." | consistent | 0.41 | 0.41 |

## Expansion critic: checking generated beats

`critic`: 10 TypeSafe calls (0 fresh), 0 baseline calls, 0 s.

- 10 generated beat chains, three checks each. Right per check: contradiction 10/10 (100%), advances toward target 9/10 (90%), new named character 8/10 (80%). Overall pass/fail verdict 10/10 (100%).
- Not compared with the current critic, whose prompt needs a full expansion plan; the checks here are the ones its JSON verdict is meant to cover.

### Every chain

| case | truth c/a/n | contradicts | advances | new character |
| --- | --- | --- | --- | --- |
| K01 | n/Y/n | 0.09 | 0.97 | 0.06 |
| K02 | Y/Y/n | 0.92 | 0.21 | 0.98 |
| K03 | n/Y/Y | 0.05 | 0.94 | 0.98 |
| K04 | n/n/n | 0.09 | 0.10 | 0.06 |
| K05 | n/Y/n | 0.06 | 0.88 | 0.13 |
| K06 | Y/Y/n | 0.88 | 0.84 | 0.67 |
| K07 | n/Y/n | 0.11 | 0.96 | 0.07 |
| K08 | Y/Y/n | 0.90 | 0.75 | 0.04 |
| K09 | n/n/n | 0.06 | 0.08 | 0.07 |
| K10 | n/Y/Y | 0.08 | 0.81 | 0.98 |

## World Info curator: which lore entries matter right now?

`wi-relevance`: 4 TypeSafe calls (0 fresh), 0 baseline calls, 0 s.

- 4 scenes x their candidate entries = 17 on/off judgments. Accuracy at 0.5: 88%, AUROC 1.00.
- This covers the enable/disable half of the curator only; rewrites and patches need generated text and stay on the LLM.

### Every entry

| scene | entry | should be | p(active) |
| --- | --- | --- | --- |
| W1 | Guild hall | on | 0.95 ✓ |
| W1 | Mother's farm | off | 0.04 ✓ |
| W1 | Ponticius | on | 0.87 ✓ |
| W1 | Solari glyphs | off | 0.17 ✓ |
| W1 | The sphinx | off | 0.23 ✓ |
| W2 | Guild hall | off | 0.02 ✓ |
| W2 | Mother's farm | off | 0.03 ✓ |
| W2 | Ponticius | off | 0.03 ✓ |
| W2 | Solari glyphs | on | 0.33 ✗ |
| W2 | The sphinx | on | 0.97 ✓ |
| W3 | Mother's farm | on | 0.80 ✓ |
| W3 | Solari glyphs | off | 0.09 ✓ |
| W3 | The sphinx | off | 0.10 ✓ |
| W4 | Brandt's habits | on | 0.46 ✗ |
| W4 | Maeve's stage act | off | 0.13 ✓ |
| W4 | Pier Street safehouse | off | 0.07 ✓ |
| W4 | The Blue Anchor | on | 0.83 ✓ |

## Scene-setter: pick an installed background

`backgrounds`: 12 TypeSafe calls (0 fresh), 0 baseline calls, 0 s.

- 12 scenes, 22 installed backgrounds + "none". Right pick: 11/12 (92%); including the two scenes with no fitting background: B11 → none, B12 → none.

### Every scene

| case | scene | acceptable | pick | confidence |
| --- | --- | --- | --- | --- |
| B01 | The guild hall at midday: a crowded common room, a crackling hearth, and a job board covered in parchment. | tavern day.jpg | tavern day.jpg ✓ | 0.95 |
| B02 | A stone sphinx guards a golden, half-buried gate in the desert; the party stands before the ancient ruins. | sun_ruins.jpg \| sun_ruins2.jpg | sun_ruins.jpg ✓ | 0.66 |
| B03 | The party flees through a medieval market street at night, lanterns swinging above the shuttered stalls. | cityscape medieval night.jpg | cityscape medieval market.jpg ✗ | 0.84 |
| B04 | Dawn over a still mountain lake; the party breaks camp on the shore. | landscape mountain lake.jpg | landscape mountain lake.jpg ✓ | 0.99 |
| B05 | A moonlit beach; waves wash over the sand as two figures walk along the shoreline. | landscape beach night.jpg | landscape beach night.jpg ✓ | 1.00 |
| B06 | An audience with the queen in her gilded throne room. | royal.jpg | royal.jpg ✓ | 0.96 |
| B07 | A quiet room at the inn: a bed, a washstand, and a small window over the street. | bedroom clean.jpg \| bedroom red.jpg | bedroom clean.jpg ✓ | 0.90 |
| B08 | The survivors pick through the ruins of a collapsed city, rusted cars and broken towers all around. | cityscape postapoc.jpg \| landscape postapoc.jpg | cityscape postapoc.jpg ✓ | 0.98 |
| B09 | A cabin on a frozen lake in deep winter, smoke rising from the chimney. | landscape winter lake house.jpg | landscape winter lake house.jpg ✓ | 1.00 |
| B10 | A cramped neon-lit apartment high above a rainy megacity, holograms flickering over the bed. | bedroom cyberpunk.jpg | bedroom cyberpunk.jpg ✓ | 1.00 |
| B11 | The reactor room of a salvage spaceship: warning lights, coolant pipes, and a flickering containment field. | none | none ✓ | 0.87 |
| B12 | A 1940s police precinct at three in the morning: cold coffee, ringing phones, rain on the windows. | none | none ✓ | 0.94 |

## Performance: latency, fan-out, state size, bursts, cost, and repeat-run stability

`performance`: 136 TypeSafe calls (136 fresh), 0 baseline calls, 33 s.

- Fan-out: 1 question(s) p50 240 ms, 4 question(s) p50 237 ms, 16 question(s) p50 268 ms, 64 question(s) p50 275 ms on the same state.
- State size: 2 messages ≈ 565 tokens, p50 262 ms; 8 messages ≈ 885 tokens, p50 268 ms; 32 messages ≈ 2102 tokens, p50 282 ms; 96 messages ≈ 5417 tokens, p50 289 ms.
- Burst of 16 parallel calls: all done in 672 ms wall time, slowest 666 ms, retries 0.
- Repeat-run stability over 5 identical requests for 16 real calls (118 answers): mean spread 0.0118, decisions that flipped between runs 5/118.
- Cost: 1910 input tokens per boundary for shared read + direction, about $0.080 per 1000 boundaries. Today's shared-read prompt averages 3701 characters and runs on your GPU.

### Fan-out: questions per call vs latency (5 sequential calls each)

| questions | p50 | min | max | input tokens |
| --- | --- | --- | --- | --- |
| 1 | 240 ms | 230 ms | 760 ms | 474 |
| 4 | 237 ms | 232 ms | 267 ms | 532 |
| 16 | 268 ms | 225 ms | 316 ms | 763 |
| 64 | 275 ms | 230 ms | 361 ms | 1679 |

### State size: transcript length vs latency (4 questions, 5 calls each)

| messages | input tokens | p50 | max |
| --- | --- | --- | --- |
| 2 | 565 | 262 ms | 299 ms |
| 8 | 885 | 268 ms | 295 ms |
| 32 | 2102 | 282 ms | 291 ms |
| 96 | 5417 | 289 ms | 370 ms |

### Repeat-run stability by answer type

| type | answers | mean std of probability/score | worst std | decision flipped |
| --- | --- | --- | --- | --- |
| noul | 65 | 0.0097 | 0.047 | 4/65 |
| choice | 45 | 0.0132 | 0.080 | 0/45 |
| score | 8 | 0.0202 | 0.036 | 1/8 |

### Answers whose decision flipped between identical runs

| call | question id | type | std |
| --- | --- | --- | --- |
| extraction:H07 | tension | score | 0.019 |
| director:D01 | reason:Arin | noul | 0.023 |
| director:D03 | addr:Ponticius | noul | 0.028 |
| director:D03 | addr:Arin | noul | 0.040 |
| director:D03 | reason:DM Narrator | noul | 0.019 |

### Cost per 1000 boundaries (input tokens only; output is free)

| call | mean input tokens | per 1000 |
| --- | --- | --- |
| shared read (one Jev call per boundary) | 970 | $0.0407 |
| speaker direction (one Jev call per group turn) | 940 | $0.0395 |
| both, per boundary | 1910 | $0.0802 |

