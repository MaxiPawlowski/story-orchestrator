v2.4 follow-up U5 (fireNpcReplies post-await ownership check, 644aa05 via 5d9957e) live gate. Lane 1 (ST :8101, CDP 9301), group 1759606632088, profile Artemis RunPod RP (Artemis 31B, 127.0.0.1:18080), bundle.served e420eab0c646 = dist/manifest.json bundle.sha256.
live-v24-npc-switch-run1/run2: the x2 (consecutive, same fixture bytes as committed). -prerun: the first run, same assertions, before the fixture's disk read reported engineState.activeCheckpointId/firedNpcReplies (reporting-only change); green too, not counted in the x2.
live-v4-turn-identity-run1/run2 and plan03a-llm-npc-reply-run1/run2: regression x2 each, green.
Run-header diff around the whole lane-1 batch (pre -> end): 0 differences, ok.
