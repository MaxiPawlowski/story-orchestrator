### J11 judgment-backend — The judgment model behind the ST server plugin: reachable with a key, off by default, deciding speaker direction when opted in, falling back to today's chain on a timeout, recorded in its own ring, and never leaking the key.

| Check | Mode | Findings | Outcome | Detail |
|---|---|---|---|---|
| J11.1 | auto | — | pass |  |
| J11.2 | auto | — | pass |  |
| J11.3 | auto | — | pass |  |
| J11.4 | auto | — | pass |  |
| J11.5 | auto | U3 | pass |  |
| J11.6 | auto | — | pass |  |
| J11.7 | auto | — | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: a shared read needs a window or a chat reader
    at w (http://127.0.0.1:8101/scripts/extensions/th |
| J11.8 | auto | — | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: a shared read needs a window or a chat reader
    at w (http://127.0.0.1:8101/scripts/extensions/th |
| J11.9 | auto | — | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: M07 update did not supersede the older note: ["contradicted","kept"]
    at eval (eval at <anonymou |
| J11.10 | auto | — | pass |  |
| J11.11 | auto | — | pass |  |
| J11.12 | auto | — | pass |  |
| J11.13 | auto | — | pass |  |
| J11.14 | auto | — | pass |  |
| J11.15 | auto | — | fail | Generation still active after 300000ms timeout. |
| J11.16 | auto | — | fail | Generation still active after 300000ms timeout. |
| J11.17 | auto | — | fail | Generation still active after 300000ms timeout. |
| J11.18 | auto | — | pass |  |
| J11.19 | auto | — | pass |  |
| J11.20 | auto | — | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: still at hall: the judged delta did not fire the gate
    at eval (eval at <anonymous> (eval at eva |
| J11.21 | auto | — | pass |  |
| J11.22 | auto | — | pass |  |
| J11.23 | auto | — | fail | Evaluation failed in SillyTavern page: page.evaluate: Error: no direct stall write: [{"at":"2026-09-26T20:47:49.140Z","boundary":6,"kind":"stall","window":{"fro |
| J11.24 | auto | — | pass |  |
| J11.25 | auto | — | pass |  |
| J11.26 | auto | — | pass |  |
