# plan05 live session 3 — the J5.6 variant, complete, and J8 twice

Pod `8g1vdb619mk21u` started for this session ($0.72/hr), proxy verified, both CM profiles repointed
(`https://8g1vdb619mk21u-8080.proxy.runpod.net`) and **put back** to `http://127.0.0.1:18080` at the
end; page reloaded onto the current bundle; `/profile Artemis RunPod RP` re-probed; judge off; no
`debugResponse` anywhere. Pod stopped at the end.

| file | what it is |
|---|---|
| `j56-variant-evidence.json` | **the J5.6 variant, all four legs GREEN on a real model**: pin a private row for a drafted member → the applied block carries it → edit (rollback) → `source-removed` + pin kept + gone from the applied block → panel reconfirm → `live`/`source: author`/`override.from: "reconfirm"` → **back in the applied block** |
| `j8-run1.json` / `j8-run2.json` (+ `j8-run2-matrix.md`, both logs) | journey **J8 (stagecraft) twice: 6/6 automated, 0 fail, first attempt, no retries, cleanup clean** — including **J8.5 and J8.6**, the warden checks the plan names |

The third leg of the J5.6 variant is the one the previous session could not assert: the gate asks about
the **drafted member's** block while `getEpistemicBlock()` re-renders for the **active speaker**, so
they agreed only by coincidence. This session reads `getAppliedEpistemicBlock()` (what ST's next prompt
actually holds) and the leg passes.

What this session does NOT cover is in `j56-variant-evidence.json` §notProven: the HTTP-request capture
for the private block (read from the applied prompt here; the request-level, per-member evidence is the
previous session's), J3 twice on the final fixture, and the human rubrics.
