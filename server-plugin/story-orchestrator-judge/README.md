# story-orchestrator-judge

SillyTavern server plugin for Story Orchestrator's **judge**: a server-side proxy from the extension to its judgment
providers, so a provider key never reaches the browser. Optional: without it, every judge use takes its ordinary
path. User guide: [`docs/guide/setup/judge.md`](../../docs/guide/setup/judge.md).

## Install

1. Copy this folder to `<SillyTavern>/plugins/story-orchestrator-judge/` (from a source checkout:
   `npm run plugin:install -- --st-root <SillyTavern>`).
2. Set `enableServerPlugins: true` in SillyTavern's `config.yaml` and restart SillyTavern.
3. In **Extensions → Story Orchestrator → Author services → Judge**, paste a TypeSafe key and press **Save key**.

## Providers

| Provider | What | Key |
|---|---|---|
| `typesafe` (default) | TypeSafe System One, models `jev-1.13.0` (default), `jev-latest`, `jev-preview` | `typesafe_api_key` |
| `llama-logprob` | A llama-server you run, asked for log-probabilities (`n_predict` ≤ 4, `n_probs` ≤ 50) | `so_judge_llama_key` (optional) |

## Where the key comes from

In order:

1. The requesting user's SillyTavern secrets (`typesafe_api_key`; written by the panel through SillyTavern's own
   `writeSecret`, never readable by the page).
2. Only when SillyTavern user accounts are **off**: the `TYPESAFE_API_KEY` environment variable (`SO_JUDGE_LLAMA_KEY`
   for llama), then a `TYPESAFE_API_KEY=` line in `~/.typesafe/api-key/.env` (TypeSafe only). With accounts on, each
   user uses only their own secrets.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `TYPESAFE_API_KEY` | | key fallback (accounts off only) |
| `TYPESAFE_BASE_URL` | `https://api.typesafe.ai` | the plugin calls `<base>/v1/systemone` |
| `SO_JUDGE_LLAMA_URL` | | the llama-server for `llama-logprob`; never taken from the page |
| `SO_JUDGE_LLAMA_KEY` | | llama-server key fallback |
| `SO_JUDGE_ACCOUNT_RATE_PER_MIN` | 1200 | the provider account's request ceiling |
| `SO_JUDGE_ACCOUNT_TOKENS_PER_SEC` | 250000 | the account's input-token ceiling |
| `SO_JUDGE_RATE_PER_MIN` | 2 × account / 5 (480) | each SillyTavern user's share |
| `SO_JUDGE_MAX_IN_FLIGHT` | 2 | concurrent calls per user |

## Limits and behaviour

- **Size**: a request whose estimate (3.488 characters per token) passes 32,000 tokens for the state plus the longest
  question, or 64,000 for the whole request, each minus 10%, is refused with 413 and never truncated. The extension
  reads that as "too large" and takes its fallback.
- **Rate**: per user 2 in flight, 16 queued, 2 s queue wait. A provider 429 halves the effective rate (floor 10%); a
  `Retry-After` holds every call that long (capped at 5 minutes); the rate recovers over 120 s after a 30 s hold.
  `GET /status` reports the adaptive state.
- **Timeout**: 10 s upstream.
- The judge never blocks the story and never writes to it; the extension decides what to do with each answer.

## Routes

Under `/api/plugins/story-orchestrator-judge`, each requiring the `x-so-plugin: 1` header and a same-origin request
(SillyTavern's own CSRF and user middleware run first):

- `GET /status`: plugin version, default model, whether each provider is configured and where its key came from
  (never the key), and the adaptive rate state.
- `POST /systemone`: one TypeSafe System One request.
- `POST /providers/llama-logprob/completion`: one llama-server completion with log-probabilities.

## Tests

`npm run test:plugin` (node:test). `JUDGE_LIVE=1` adds one real API call.
