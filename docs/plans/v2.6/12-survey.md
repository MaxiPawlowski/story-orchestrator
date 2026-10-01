# Plan 12 Phase 0: open judge survey

**Date:** 2026-09-30. All URLs accessed 2026-09-30 unless a row says otherwise. Docs only; no probe was executed.

## Purpose, method

- Purpose: fill the Phase 0 matrix of `12-open-judge.md`, one row per candidate decision provider for the System One contract (`noul` p, `choice` distribution, `score` distribution over a scale). Includes the J4 row (TypeSafe terms).
- Method: vendor docs, legal pages, model cards, llama.cpp source (read, not built), ST source at `C:\dev\SillyTavern-MainBranch\src\transformers.js`. Where a figure comes from this repo's own earlier measurements, the row says "repo-measured" and names the note.
- Rule: no number without a source. A column with no documented answer reads "not found (checked: ...)".
- Contract column vocabulary: **native** = the provider returns typed probabilities; **logprob** = p derived from token logprobs / softmax over option tokens; **classifier** = p from a classification head (NLI entailment, sigmoid/softmax label scores); **verbalized** = the model writes the answer/score as text, no distribution.
- Reference hw: RTX PRO 4500 / RTX 5090 pods running llama-server with Artemis (31B, Gemma-4-based, 19 GB GGUF per `.claude/rules/gotchas.md`), local RTX 3090.

## Summary tables

### F1 Current vendor

| Row | Contract | Runs | Context | Latency | Cost | Terms / data | Licence | Spanish |
|---|---|---|---|---|---|---|---|---|
| J4 TypeSafe Jev (`jev-1.13`, `jev-latest`) | native (noul p; choice/score `probabilities` + `confidence`) | hosted only, US | 64k per request, 32k for `state` + longest question (docs); 32,000 listed by Cloudflare/OpenRouter | vendor: 0.114 s sample workflow; repo-measured ~650 ms cold / ~250 ms warm | $0.042 / 1M input, output free | no training on Input (Privacy Policy + MCA 4.1 "without Customer's prior consent"); retention "as long as reasonably necessary", no fixed period; hosted in US; telemetry usable without restriction; ZDR enterprise-only; DPA with EU SCCs; sub-processor list at trust.typesafe.ai (page did not render) | proprietary, MCA (no distillation / competing product) | "handled but not equally well" (non-English) |

### F2 Jev through other hosts

| Row | Contract | Runs | Context | Latency | Cost | Terms / data | Licence | Spanish |
|---|---|---|---|---|---|---|---|---|
| OpenRouter `typesafe/jev-1.13`, `jev-latest`, `jev-router` | native, via `POST https://openrouter.ai/api/v1/systemone` | hosted | 32,000 (jev-1.13) | not found (checked: openrouter.ai/typesafe, /provider/typesafe; model pages 404) | $0.042 / 1M in, $0 out | provider data policy not shown (checked: openrouter.ai/provider/typesafe, SDK guide) | proprietary | as J4 |
| Cloudflare Workers AI `typesafe/jev` | native (noul/choice/score with probabilities) | hosted | 32,000 | not found (checked: developers.cloudflare.com/ai/models/typesafe/jev/) | $0.042 / 1M in, $0 out | "Zero data retention" stated on model page | proprietary | as J4 |
| NanoGPT `typesafe/jev-1.13`, `jev-latest` | listed, but no `/systemone` endpoint documented: chat/responses/messages only, so typed contract not exposed as documented | hosted | not found (checked: nano-gpt.com/models/text, nano-gpt.com/api) | not found (same) | not found (same) | not found (checked: nano-gpt.com/api) | proprietary | as J4 |

### F3 Logprob-scored LLMs

| Row | Contract | Runs | Context | Latency | Cost | Terms / data | Licence | Spanish |
|---|---|---|---|---|---|---|---|---|
| llama-server + Artemis (Gemma-4 31B base) | logprob: `/completion` `n_probs` (no documented cap); `/v1/chat/completions` `logprobs`+`top_logprobs` (default 20); plus `grammar`/`json_schema`/`logit_bias` to constrain | local / own pod; 19 GB GGUF fits 24 GB (3090) and pods; CPU impractical for 31B (no source measured) | Gemma 4 31B: 256K (model card); served ctx = pod config | not measured for 1-token decisions; repo-measured ~33 tok/s generation on PRO 4500 | pod $0.72/hr (repo-measured, gotchas) or local power | nothing leaves machine (own pod: RunPod host) | Gemma terms (Artemis finetune licence not checked) | Gemma 4: 140+ languages pretrained, 35+ out of box |
| vLLM | logprob: `logprobs`/`top_logprobs`, server cap `max_logprobs` default 20 (-1 = no cap); `structured_outputs.choice` constrains to option set | local / pod | model-dependent | not found | own hw | local | Apache-2.0 (vLLM) | model-dependent |
| SGLang | logprob: `choices` with `token_length_normalized` (default), greedy, unconditional-likelihood-normalized | local / pod | model-dependent | not found | own hw | local | Apache-2.0 | model-dependent |
| Ollama | logprob: native `/api/generate` + `/api/chat` since v0.12.11, `top_logprobs` 0-20; OpenAI-compat `/v1/chat/completions` silently drops them (issue 16117 closed not planned) | local | model-dependent | not found | free | local | MIT | model-dependent |
| LM Studio | logprob: candidate `top_logprobs` since 0.3.39; GGUF yes, MLX runtime not | local | model-dependent | not found | free app | local | proprietary app | model-dependent |
| OpenAI API | logprob: `top_logprobs` 0-20; only with reasoning effort `none` (GPT-6 Sol, Luna; not Astra, 6.1 Sol) | hosted | not checked per model | not found | e.g. GPT-6 Luna $0.10 in / $0.50 out per 1M (pricing page) | no training by default; abuse logs up to 30 days; ZDR by approval; EU data residency available | proprietary | yes (not quantified) |
| Together AI | logprob: `logprobs`, `top_logprobs` (no max documented) | hosted | model-dependent | not found | not checked | not checked | per model | model-dependent |
| Fireworks AI | logprob: `top_logprobs` 0-5 only | hosted | model-dependent | not found | not checked | not checked | per model | model-dependent |
| DeepInfra | logprob: `logprobs`, `top_logprobs` documented; may be model-dependent | hosted | model-dependent | not found | not checked | not checked | per model | model-dependent |
| OpenRouter (generic models) | logprob: `top_logprobs` 0-20, support depends on routed provider | hosted | model-dependent | not found | per model | per provider | per model | model-dependent |
| Groq | none: `logprobs`, `top_logprobs`, `logit_bias` return 400 | hosted | - | - | - | - | - | - |
| Gemini API | logprob: `responseLogprobs` + `logprobs` 1-20; silently disabled for gemini-2.5-flash Oct 2025 (forum), Vertex still served it | hosted | not checked | not found | not checked | paid: no product-improvement use, limited-period abuse logs; free tier trains + human review; EEA/CH/UK must use paid | proprietary | yes |
| OpenJev (GPT-AGI) | logprob shim: softmax over the label set at the answer position; Jev-shaped Choice/Score/Noul API | local (Transformers) | model-dependent | 290 ms for 1 question, 328 ms for 27 (hardware not stated) | free | local | MIT | model-dependent |

### F4 Open classifiers / NLI

| Row | Contract | Runs | Context | Latency | Cost | Terms / data | Licence | Spanish |
|---|---|---|---|---|---|---|---|---|
| MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 (+ `Xenova/` and `onnx-community/` ONNX ports) | classifier: entailment p (noul), zero-shot label scores (choice), binned labels (score) | local; 0.3B params; ONNX; CPU-feasible (size); GPU: no FP16 | not stated on card (checked: model card); DeBERTa-v3 family 512 per zeroshot-v2.0 table | 1446 texts/s on A100 (Spanish test) | free | local | MIT | XNLI es accuracy 0.832 |
| MoritzLaurer/bge-m3-zeroshot-v2.0 | classifier (NLI zero-shot) | local; 0.6B; ONNX | 8,192 | not found (checked: model card) | free | local | MIT | multilingual (100+ via BGE-M3); card: multilingual worse than English-only |
| MoritzLaurer/deberta-v3-large-zeroshot-v2.0 | classifier | local; params not read (checked: bge-m3-zeroshot-v2.0 card table); English | 512 | not found | free | local | MIT | no (English) |
| tasksource/ModernBERT-large-nli | classifier | local; 0.4B | not stated (checked: model card) | not found | free | local | Apache-2.0 | no (English) |
| knowledgator/gliclass-x-base | classifier: per-label sigmoid scores, one forward pass | local; 0.3B; mDeBERTa backbone | not stated (checked: model card) | not found | free | local | Apache-2.0 | yes (examples incl. Spanish); multilingual F1 0.418 |
| Jina Classifier API | classifier (embedding-based zero-shot, up to 256 classes) | hosted (Jina, part of Elastic) | 8,192 per input | not found | token-based, 10M free tokens | "never use your API requests, inputs, or outputs to train" | proprietary | multilingual (jina-embeddings-v3) |
| Cohere Classify | classifier; default-embed classify deprecated after 2025-01-31, new fine-tunes retired | hosted | - | - | - | - | - | - |
| ST built-in transformers backend | classifier only via code: ST registers `text-classification` (default go-emotions), no `zero-shot-classification` task; bundled `sillytavern-transformers` 2.14.6 contains `ZeroShotClassificationPipeline` | local, ST server (onnxruntime-node) | model-dependent | not found | free | local | AGPL-3.0 (ST) / Apache-2.0 (transformers.js) | model-dependent |

### F5 Reward / judge models

| Row | Contract | Runs | Context | Latency | Cost | Terms / data | Licence | Spanish |
|---|---|---|---|---|---|---|---|---|
| Prometheus 2 7B (`prometheus-eval/prometheus-7b-v2.0`) | verbalized `[RESULT] 1-5`; logprob-derivable if served by llama-server/vLLM (score digit token) | local; 7B (Mistral-7B-Instruct-v0.2); GGUF exists | not stated on card | not found | free | local | Apache-2.0 | English |
| Prometheus 2 8x7B | verbalized; logprob-derivable | local; 47B | not stated | not found | free | local | Apache-2.0 | English |
| Atla Selene-1-Mini-Llama-3.1-8B | verbalized score/critique; logprob-derivable | local; 8B | 128K | not found | free | local | Apache-2.0 (card; base is Llama 3.1) | yes (listed incl. Spanish) |
| Flow-Judge-v0.1 | verbalized `<score>` (binary, 3-, 5-point); logprob-derivable | local; 3.8B (Phi-3.5-mini); min 4 GB VRAM; GGUF/AWQ | 8,192 | not found | free | local | Apache-2.0 | English only |
| Skywork-Reward-V2 (Llama-3.1-8B; Qwen3 0.6B-8B; Llama-3.2 1B/3B) | scalar reward (classification head), not a distribution; pairwise p via Bradley-Terry sigmoid only | local | 16,384 (8B) | not found | free | local | Llama 3.1 community (8B) | not stated |
| IBM Granite Guardian 3.3 8B | logprob: yes/no token logprobs as risk p; custom criteria | local; 8B | not stated | not found | free | local | Apache-2.0 | English only |
| Llama Guard 4 12B | verbalized `safe`/`unsafe` + category; logprob-derivable (not documented) | local; 12B | not stated | not found | free | local | Llama 4 community | yes (incl. Spanish) |
| JudgeLM-7B | verbalized | local; 7B (Vicuna) | not checked | not found | free | local | non-commercial | English |

### F6 CLI harness models

| Row | Contract | Runs | Context | Latency | Cost | Terms / data | Licence | Spanish |
|---|---|---|---|---|---|---|---|---|
| Claude Code `claude -p` | verbalized | hosted (Anthropic), local CLI | model-dependent | repo-measured 2-3.4 s wall (isolated flags, 402 input tokens) | subscription or API | consumer: training only if setting on, 5 y retention on / 30 d off; commercial/API: no training, 30 d, ZDR for qualified Enterprise | proprietary | yes |
| Codex `codex exec` | verbalized | hosted (OpenAI), local CLI | model-dependent | not found (checked: learn.chatgpt.com non-interactive docs; repo notes) | ChatGPT plan or API | ChatGPT sign-in follows workspace retention settings; API key follows API org settings (no training by default, 30 d abuse logs) | Apache-2.0 CLI, proprietary models | yes |
| opencode `opencode run` | verbalized | hosted (per provider), local CLI | model-dependent | repo-measured ~6-7 s wall (inline agent, 133 input tokens) | per provider / Zen / Go | direct provider key bypasses Zen proxy; Zen/Go: downstream zero-retention claims, OpenCode's own policy lists prompts for "Improving the Services"; training question closed without answer | MIT CLI | yes |

### F7 Anything else

| Row | Contract | Runs | Context | Latency | Cost | Terms / data | Licence | Spanish |
|---|---|---|---|---|---|---|---|---|
| Community Jev clones (poorjev, von, Laya, NanoJev, LitJev, kev, jevper, opendecider) | mixed: NLI + temperature scaling (poorjev), logprob wrappers over OpenAI-compatible logprobs (jevper, opendecider), small trained heads | local | not found | von claims <15 ms (hw not stated); others not found | free | local | not found (checked: dev.to survey article) | not found |
| Outlines / llama.cpp GBNF / vLLM guided choice | constraint only (forces a valid option); p still needs logprobs | local | - | - | free | local | Apache-2.0 (Outlines), MIT (llama.cpp) | - |

## F1 detail: TypeSafe Jev (J4)

Sources:
- Home/pricing: https://typesafe.ai ($42 / billion input tokens; 0.114 s vs 8.566 s sample).
- Models: https://docs.typesafe.ai/models (`jev-1.13`, aliases `jev-latest`, `jev-preview`; 64k per request, 32k for `state` plus longest question; text only; $0.042/M in, output free; 100K tokens/s, 40 req/s; non-English "handled but not equally well").
- API: https://docs.typesafe.ai/api.md (`POST https://api.typesafe.ai/v1/systemone`; `answers`, `usage`; 401/422/429/529). Primitives: https://docs.typesafe.ai/primitives.md (noul = p(yes); choice = `choice`, `probabilities`, `confidence`; score = `score`, `legend`, `probabilities`, `confidence`).
- Jaggedness: https://docs.typesafe.ai/model-jaggedness/jev-1.13 (answers the literal question; adversarial content "can move the answer"; indirection weak). Relevant: fiction text in `state` is adversarial-shaped by nature.
- Privacy Policy (last updated Nov 19, 2025): https://typesafe.ai/legal/privacy-policy
- Terms of Use (last updated Sep 19, 2026): https://typesafe.ai/legal/terms
- Master Customer Agreement (last updated Sep 23, 2026): https://typesafe.ai/legal/mca
- DPA (Apr 24, 2026): https://typesafe.ai/legal/data-processing
- AUP (Sep 23, 2026): https://typesafe.ai/legal/acceptable-use-policy
- Legal index: https://docs.typesafe.ai/legal (ZDR for enterprise via sales@typesafe.ai)
- Sub-processors: https://trust.typesafe.ai/subprocessors (JS-rendered; fetch returned only the title, list not read)

**J4 answer (terms and data policy):**

| Question | Answer | Source |
|---|---|---|
| Training on customer data | No. Privacy Policy: "We will not train or fine tune any artificial intelligence or machine learning models on your prompts or other Input." MCA 4.1: no Customer Data in a training dataset "without Customer's prior consent". | privacy-policy, mca |
| Telemetry | MCA 4.3: Telemetry (technical logs, hashes, summary statistics, metrics) may be processed "without restriction, including to improve the Services". Hashes of inputs are telemetry. | mca |
| Retention | No fixed period. Privacy: "as long as reasonably necessary to provide you with the Services" (also "business or commercial purposes"). DPA: "as long as necessary taking into account the purpose". MCA 10.3: no obligation to retain, may delete at any time. ZDR: enterprise only, by contact. | privacy-policy, data-processing, mca, docs legal |
| Region | "The Services are hosted in the United States." EEA/UK data transferred to US. DPA: EU SCCs Module 2 + UK IDTA; DPA governed by Irish law. | privacy-policy, data-processing |
| Sub-processors | List lives at trust.typesafe.ai/subprocessors; not readable by fetch. Privacy Policy names Google Analytics, a payment processor, unnamed vendors. | data-processing, privacy-policy |
| Third-party disclosure of Input | "will not disclose any Input to a third party other than our service providers" | privacy-policy |
| Customer restrictions | MCA 2.3: no model distillation / "train a model to imitate" outputs, no competing product, no reverse engineering. Relevant to Phase B: using Jev answers as labels to calibrate or train a local replacement may be "imitation"; calibration against gold fixtures is not. | mca |
| Content | AUP bars sexual content involving minors; no roleplay/fiction clause either way. Privacy Policy: no data knowingly from under-18s. | acceptable-use-policy, privacy-policy |
| Jurisdiction | Terms of Use: Delaware; MCA: California, San Francisco, binding individual arbitration, class waiver; DPA: Ireland. | terms, mca, data-processing |
| Status | Early access since 2026-09-15 (waitlist); Terms page mentions "Jev, in early access"; MCA has no beta clause. | terms, datacamp.com/blog/system-one-models-jev |

Net for the privacy notice (plan 12 Phase A): player chat text leaves the machine to a US host; not used for training; retention unbounded in wording; hashes/metrics kept freely; ZDR only on enterprise contract. Cloudflare's route claims ZDR on its page (see F2), which is the only no-contract ZDR path found.

## F2 detail: Jev through other hosts

- OpenRouter: 3 models (https://openrouter.ai/typesafe). Typed contract exposed natively at `https://openrouter.ai/api/v1/systemone` with `model`, `state`, `questions`; response has `answers` with probabilities, `provider: "TypeSafe"`, usage+cost (https://openrouter.ai/docs/guides/community/typesafe-sdk). The guide shows `noul` and `choice`; `score` not shown (not confirmed). `jev-router` is a model router (1M context, $0), not a judge. Context/price per search snippet of https://openrouter.ai/typesafe/jev-1.13 (page itself 404 on fetch).
- Cloudflare Workers AI: `typesafe/jev` at `/client/v4/accounts/{id}/ai/run`; 32,000 context; ZDR stated (https://developers.cloudflare.com/ai/models/typesafe/jev/).
- NanoGPT: lists `typesafe/jev-1.13`, `typesafe/jev-latest` (https://nano-gpt.com/models/text); API docs list chat completions, responses, messages, models only (https://nano-gpt.com/api). Whether a chat call to Jev returns anything usable: not found. Not a native route as documented.
- Also seen: Vercel AI Gateway route (search snippet, https://flaviocopes.com/jev/), not checked further.

## F3 detail: logprob-scored LLMs

- llama.cpp server README: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md ; code: `tools/server/server-task.cpp`, `tools/server/server-common.cpp` (master, read 2026-09-30).
- vLLM: https://docs.vllm.ai/en/stable/configuration/engine_args/ (`max_logprobs` 20 default), https://docs.vllm.ai/en/latest/features/structured_outputs.html (`structured_outputs: {choice: [...]}`).
- SGLang: https://docs.sglang.io/docs/references/frontend/choices_methods ; length-bias issue https://github.com/sgl-project/sglang/issues/523.
- Ollama: https://newreleases.io/project/github/ollama/ollama/release/v0.12.11 ; https://github.com/ollama/ollama/issues/16117 (OAI endpoint drops logprobs; closed not planned); https://github.com/ollama/ollama/pull/18580 (`logprob_tokens` for named tokens, closed unmerged 2026-09-22, author prefers raising the `top_logprobs` cap).
- LM Studio: https://x.com/lmstudio/status/2011907482084319336 ; MLX caveat via https://github.com/nowledge-co/nowledge-mem/issues/128.
- OpenAI: top_logprobs 0-20 https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create ; reasoning-effort restriction https://developers.openai.com/api/docs/guides/latest-model ; data https://developers.openai.com/api/docs/guides/your-data ; price https://developers.openai.com/api/docs/pricing.
- Together: https://docs.together.ai/docs/logprobs . Fireworks: https://docs.fireworks.ai/api-reference/post-completions . DeepInfra: https://docs.deepinfra.com/chat/log-probs . OpenRouter: https://openrouter.ai/docs/api/reference/parameters . Groq: https://console.groq.com/docs/openai .
- Gemini: https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerationConfig.html ; https://discuss.ai.google.dev/t/logprobs-is-not-enabled-for-gemini-models/107989 ; terms https://ai.google.dev/gemini-api/terms (last modified 2026-04-28).
- Gemma 4: https://ai.google.dev/gemma/docs/core/model_card_4 , https://huggingface.co/google/gemma-4-31B-it .
- OpenJev: https://github.com/GPT-AGI/OpenJev .

How logprob serves System One: constrain the answer to a single token per option (`Yes`/`No`, `A`..`E`, `1`..`5`), read `top_logprobs` at the first generated position, softmax (renormalize) over the option tokens only. `noul` = p(Yes)/(p(Yes)+p(No)); `choice` = renormalized option distribution; `score` = distribution over digits, expected value for the scalar. Mass outside the option set is a quality signal (report it; reject when high).

## F4 detail: open classifiers / NLI

- https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 ; ONNX: https://huggingface.co/Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 , https://huggingface.co/onnx-community/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7-ONNX
- https://huggingface.co/MoritzLaurer/bge-m3-zeroshot-v2.0 (also lists deberta-v3-large-zeroshot-v2.0 MIT 512, -c variants "commercial-friendly")
- https://huggingface.co/tasksource/ModernBERT-large-nli
- https://huggingface.co/knowledgator/gliclass-x-base ; https://github.com/knowledgator/gliclass
- https://jina.ai/classifier/
- https://docs.cohere.com/changelog/classify-default-model-deprecation ; https://docs.cohere.com/docs/deprecations
- ST: `C:\dev\SillyTavern-MainBranch\src\transformers.js` (tasks: text-classification, image-to-text, feature-extraction, automatic-speech-recognition, text-to-speech; `getPipeline` indexes `tasks[task]`, so an unregistered task throws); `package.json` pins `sillytavern-transformers` 2.14.6; `node_modules/sillytavern-transformers/src/pipelines.js:1015` `ZeroShotClassificationPipeline`; `src/backends/onnx.js` uses `onnxruntime-node` in Node. Wasm threads set to 1 (Android), which applies to the web backend.

Consequence: ST's own `/api/extra/classify` path cannot run zero-shot NLI without an ST change. Our server plugin can import `sillytavern-transformers` (already installed) and call `pipeline('zero-shot-classification', 'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7')` with `cache_dir` under DATA_ROOT, no new dependency. Not probed.

Fit to contract: `noul` = entailment p of a hypothesis ("The reply contradicts X") vs contradiction; `choice` = zero-shot softmax over labels (single-label mode); `score` = one hypothesis per level, softmax, expected value. 512-token limit (DeBERTa) means the `state` must be trimmed to the relevant window; bge-m3 variant takes 8,192.

## F5 detail: reward / judge models

- https://huggingface.co/prometheus-eval/prometheus-7b-v2.0 ; https://huggingface.co/prometheus-eval/prometheus-8x7b-v2.0
- https://huggingface.co/AtlaAI/Selene-1-Mini-Llama-3.1-8B
- https://huggingface.co/flowaicom/Flow-Judge-v0.1
- https://huggingface.co/Skywork/Skywork-Reward-V2-Llama-3.1-8B (RewardBench v1 96.4, v2 84.1)
- https://huggingface.co/ibm-granite/granite-guardian-3.3-8b
- https://huggingface.co/meta-llama/Llama-Guard-4-12B
- https://huggingface.co/BAAI/JudgeLM-7B-v1.0
- Leaderboard: https://huggingface.co/spaces/allenai/reward-bench

None emits a native distribution. Generative judges (Prometheus, Selene, Flow-Judge, Granite Guardian, Llama Guard) become logprob-scored when served by llama-server/vLLM and the score token is read, same recipe as F3; Granite Guardian documents this (yes/no logprobs, `nlogprobs=20`). Skywork is scalar, useful only for pairwise comparisons. All would be a second model resident beside Artemis (VRAM), so on the reference pods they compete with the narrative model; on the 3090 an 8B Q4 fits alongside nothing else of size.

## F6 detail: CLI harness models

- Claude Code data: https://code.claude.com/docs/en/data-usage
- Codex non-interactive + auth: https://learn.chatgpt.com/docs/non-interactive-mode , https://learn.chatgpt.com/docs/auth
- opencode: https://opencode.ai/docs/cli/ , https://opencode.ai/legal/terms-of-service , https://github.com/anomalyco/opencode/issues/35102 (closed 2026-07-03 without an answer on training)
- OpenAI consumer training-default page (help.openai.com/en/articles/5722486) returned 403: consumer ChatGPT training default not confirmed here.
- Repo-measured latencies from the v2.5 plan 13 harness notes (memory `harness-routing-v25`, measured 2026-09-25).

Verbalized only; latency 2-7 s rules out the 1500 ms reply path. Off-path only, as plan 12 C12 already says.

## F7 detail: anything else

- Community clones: https://dev.to/rupesh_poojary_ce8e5e7994/open-source-jev-alternatives-run-typed-calibrated-llm-decisions-locally-4dfb ; https://github.com/zhulinchng/jevper ; https://github.com/manjunathshiva/opendecider/pull/7 ; https://jevhunt.com/projects/sshh12/nanojev/ . Unvetted; listed so Phase C can pick one as a reference implementation of the logprob recipe, not as providers.
- GoModel native `/v1/systemone` proxy for Jev/OpenRouter: https://github.com/ENTERPILOT/GoModel/pull/1097 (a gateway, not a provider).
- OpenRouter usage signal: Jev took 27% of classification requests weekly (https://app.dealroom.co/news/note/typesafe-ai-s-jev-tops-openrouter-classification-requests-at-27-weekly-share).

## Phase 0 pass check

Pass rule: every family has at least one row where every column has a documented answer or "not found" with sources.

| Family | Pass | Row that carries it | Gaps |
|---|---|---|---|
| F1 TypeSafe | yes | J4 | sub-processor names unread (JS page); retention has no number because the documents give none |
| F2 other hosts | yes | OpenRouter, Cloudflare | OpenRouter/Cloudflare latency not found; OpenRouter provider data policy not found; NanoGPT mostly not found |
| F3 logprob LLMs | yes | llama-server + Artemis | 1-token decision latency not measured (probe below); Artemis finetune licence not checked; Together/Fireworks/DeepInfra cost and terms "not checked" (not load-bearing) |
| F4 classifiers | yes | mDeBERTa xnli 2mil7 | context not on card (family 512 cited); latency only A100 throughput |
| F5 reward/judge | yes | Flow-Judge, Selene | latency not found for all; Spanish only Selene and Llama Guard |
| F6 CLI harness | yes | claude -p | codex exec latency not found |
| F7 other | partial | community clones: most columns not found (sources cited) | informational only |

Rows marked "not checked" (Together, Fireworks, DeepInfra cost/terms; JudgeLM context) are secondary rows inside a family that already passes; they are not claims.

## Findings that matter for Phase A/B

1. **Local logprob provider = llama-server `/completion`, not the chat endpoint.** Reasons: (a) `/v1/chat/completions` applies the Gemma thinking template, which already produced empty `content` on Artemis (gotchas 2026-09-25); the first generated token would be reasoning, not the answer; (b) `/completion` takes a raw prompt, so we control the answer position exactly; (c) `n_probs` has no documented cap, while the OAI paths cap at what `top_logprobs` asks (default 20 when omitted, `server-common.cpp:1435`).
2. **Exact llama-server `/completion` response shape (master, 2026-09-30):** key `completion_probabilities` (set in `server-task.cpp:360`, non-stream only), an array with one element per generated token: `{id, token, bytes, logprob, top_logprobs: [{id, token, bytes, logprob}, ...]}`. With `post_sampling_probs: true`: `logprob` becomes `prob` (0..1) and `top_logprobs` becomes `top_probs`, and `top_probs` may hold fewer than `n_probs` entries. The README example block names the array `probs` while its prose and the code say `completion_probabilities`; parse `completion_probabilities` and tolerate `probs`. A zero probability is emitted as the float lowest value, not `-inf` (`server-task.cpp:306`). Streaming responses omit it.
3. **OAI-compatible shapes on llama-server:** `/v1/chat/completions` and `/v1/completions` both put the same per-token array under `choices[0].logprobs.content` (`server-task.cpp:379`, `:434`), not OpenAI's legacy `/v1/completions` `tokens/token_logprobs/top_logprobs` layout; code comment says the format "is not yet OAI-compatible". `top_logprobs` without `logprobs: true` is a 400. How `/v1/completions` maps its `logprobs` int to `n_probs` was not verified in source.
4. **Use pre-sampling logprobs (default).** Default `n_probs` values are a plain softmax of logits; `post_sampling_probs` runs the sampler chain (top-k/min-p/DRY/XTC), which can truncate option tokens to zero. Send `temperature` low, `n_predict: 1`, `samplers` minimal, `cache_prompt: true` (README warns cached-prefix logits are not bit-identical; acceptable for calibrated thresholds, note in the calibration record).
5. **Option tokenization is a real risk.** Each option must be one token after the prompt's trailing space/newline (" Yes" vs "Yes"). Check with `/tokenize` per option set at startup; refuse a question whose options collide or split. SGLang's issue 523 documents the length bias when options are multi-token.
6. **Hosted logprob caps:** OpenAI 20 (and only with reasoning effort `none`), OpenRouter 20 (provider-dependent), Ollama 0-20, Gemini 1-20, Fireworks 5, Groq none. A 5-level score plus two sentinels fits in 5 only if the option tokens are in the top-5; renormalizing over a truncated top-k silently drops mass. Prefer providers where the cap is at least the option count + margin, or constrain with `logit_bias`/grammar so the options are the only candidates.
7. **Ollama's OpenAI endpoint drops logprobs silently** (closed not planned). A provider adapter must check that the response actually carries logprobs, never assume.
8. **Classifier route runs inside ST without new deps**: `sillytavern-transformers` 2.14.6 ships `ZeroShotClassificationPipeline` and runs `onnxruntime-node`; ST's own task table lacks it, so our plugin must call the library directly. Since W25 (English only) there is no Spanish floor: English-only models (ModernBERT-nli, deberta-v3-large-zeroshot) are eligible alongside the multilingual mDeBERTa xnli and bge-m3-zeroshot. The table's "Spanish" column is kept as survey history and decides nothing.
9. **TypeSafe via Cloudflare has a stated ZDR** with the same native contract and price; direct TypeSafe offers ZDR only by enterprise contract. Phase A's provider table could list "typesafe-cloudflare" as a separate provider with its own privacy row (needs a Cloudflare account key, and the 32k context, not 64k).
10. **MCA 2.3 distillation clause** constrains Phase B: do not use Jev answers as training labels for a local model. Calibrating a local provider against the existing gold fixtures is unaffected.
11. **Jev context: docs 64k/32k vs hosts 32,000.** The plugin's input cap must use the host's figure per provider.

## Local probe commands (not executed)

Pod or local llama-server on `127.0.0.1:18080` (repo convention). Replace the prompt with the question template.

```bash
# noul: single-token Yes/No, pre-sampling logprobs
curl -s http://127.0.0.1:18080/completion -H "Content-Type: application/json" -d '{
  "prompt": "<state>\n\nQuestion: Does the last reply contradict an established fact?\nAnswer (Yes or No):",
  "n_predict": 1,
  "n_probs": 20,
  "temperature": 0,
  "cache_prompt": true
}' | jq '.completion_probabilities[0].top_logprobs'

# score 1-5: read the digit distribution
curl -s http://127.0.0.1:18080/completion -H "Content-Type: application/json" -d '{
  "prompt": "<state>\n\nRate player agency from 1 (none) to 5 (full).\nRating:",
  "n_predict": 1,
  "n_probs": 50,
  "temperature": 0
}' | jq '.completion_probabilities[0].top_logprobs[] | {token, logprob}'

# choice with a grammar so only option letters can be sampled (logprobs stay pre-sampling)
curl -s http://127.0.0.1:18080/completion -H "Content-Type: application/json" -d '{
  "prompt": "<state>\n\nWho should speak next?\nA) Arin\nB) Ponticius\nC) Narrator\nAnswer:",
  "n_predict": 1,
  "n_probs": 20,
  "grammar": "root ::= \" A\" | \" B\" | \" C\""
}' | jq '.completion_probabilities[0]'

# check each option is one token
curl -s http://127.0.0.1:18080/tokenize -H "Content-Type: application/json" -d '{"content": " Yes"}'

# OAI chat path, for comparison (thinking off, see gotchas 2026-09-25)
curl -s http://127.0.0.1:18080/v1/chat/completions -H "Content-Type: application/json" -d '{
  "messages": [{"role": "user", "content": "<state>\nAnswer Yes or No: ..."}],
  "max_tokens": 1, "logprobs": true, "top_logprobs": 20,
  "chat_template_kwargs": {"enable_thinking": false}
}' | jq '.choices[0].logprobs.content[0].top_logprobs'
```

Latency to record per probe: `timings.prompt_ms`, `timings.predicted_ms` from the `/completion` response, wall time from curl `-w '%{time_total}'`, cold vs `cache_prompt` warm.

## Open questions

- trust.typesafe.ai sub-processor list: needs a browser read (JS page); is any sub-processor outside the US?
- Does OpenRouter's `/api/v1/systemone` serve `score`, and what is OpenRouter's retention for the TypeSafe provider?
- Does NanoGPT's chat route to Jev return anything, or is the listing unusable for the typed contract?
- Artemis finetune licence and its behaviour on single-token Yes/No prompts (does it put mass on the option tokens without thinking?).
- p50 for a 1-token decision on PRO 4500 / 5090 / 3090 with a ~2-4k-token state: measure with the probes above.
- Can the classifier and Artemis share the 3090 (mDeBERTa on CPU via onnxruntime-node is the likely answer; not measured)?
- Is calibration of a local provider against gold fixtures clearly outside MCA 2.3 "imitate" wording? Worth asking TypeSafe if Phase B compares arms side by side.
