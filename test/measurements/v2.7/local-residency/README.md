# Local residency completion — 2026-10-04

Objective: total image-to-completed-reply latency, user-approved. Reserves: 2048 MiB GPU, 4096 MiB physical RAM.

Measurements here are discovery until the frozen candidate's LT/LI repetitions and overall gates pass. Native
loading-mode comparisons preserve the profile/context/KV. Image records name admission, render, release, reply and
total cycle times; a refusal is recorded, not retried into a passing sample.

Model weights stay in their existing locations. No dedicated LoRA is installed in the configured LoRA directory;
that family cannot be measured without an existing asset supplied by the user.
