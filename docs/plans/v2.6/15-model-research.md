# Artemis 31B v1.1: model research (2026-10-01)

Web research only. Nothing was run against the pod or ST. Every claim is tagged **[S]** (sourced; numbers are in the references), **[A]** (anecdotal: tester blurbs, single issue reports, crowdsourced sheet) or **[I]** (my inference). Reddit could not be fetched, so the community view comes through secondary pages.

## 1. What the model is

- Artemis-31B-v1.1 is a finetune of **Gemma-4-31B-it**, in BF16. It uses the Gemma 4 template and supports thinking or non-thinking. Drummer says v1 "needed handholding, token banning" and that v1.1 fixes this [S1]. **v1.2 came out about 2026-09-28**. Testers call it the "strongest Artemis yet" and say it holds context better at 20–32k [S2][A].
- Gemma 4 31B has 60 layers: 50 sliding-window layers (1024-token window) and 10 global layers. The global layers use 4 KV heads with unified K/V and p-RoPE, and native context is 256K [S3][S4]. Google's sampler defaults are temp 1.0, top_p 0.95, top_k 64. Thoughts must be stripped from the history [S4].
- The card gives no recommended samplers. It links Drummer's crowdsourced sheet [S1][S5][A]:
  - v1.1: temp 1.0, min_p 0.05; "aggressive adaptive-P (0.25, decay 0.95)".
  - v1: temp 1.0, min_p 0.02–0.05, DRY 0.8/1.7/2; also top-nσ 1.5.
  - v1.2: temp 1.0 with min_p 0.025, or a neutral setup with top_k 64 ("low min_p unnecessarily constrains").
  - Note: our memory records that adaptive-P caused garbage on our setup.
- Featherless serves the model at a 32k context [S6].

## 2. Known issues relevant to our symptoms

- **Gemma 4 31B itself collapses into repetition.** A word doubles, then one token repeats until the length limit. This shows on several backends, and Gemma 3 27B was clean on the same test. The strongest trigger is grammar-constrained output, but word-doubling shows without it too. No fix yet [S7].
  - HF thread "la la la": loops in long chats on llama.cpp, vLLM and AI Studio, often after 40–50k tokens. Google partly blamed the chat template. Quantized KV made it worse. Still unresolved [S8].
- **Template asymmetry.** With thinking off, the 26B/31B models were trained to emit an empty `<|channel>thought\n<channel|>` before the answer. The HF template adds that wrapper to the generation prompt but not to past model turns, so multi-turn prompts are out of distribution. Google reproduced it. A community patch "resolved infinite generation loops" [S9][A]. Google later added the empty thought token to the template to suppress ghost thought channels [S10].
  - ST's shipped `Gemma 4` instruct preset (local `default/content/presets/instruct/Gemma 4.json`) has **no** thought wrapper anywhere: `output_sequence` is `<|turn>model\n` and `last_output_sequence` is empty [I: read from the local file; our install's copy may differ].
- **KV-cache quantization hurts Gemma.** Measured KL against f16 KV for Gemma 4 31B: **q8_0 0.108**, q4_0 0.393. Qwen models stay under 0.04 at q8_0 [S11]. Perplexity barely moves at q8_0 with Hadamard rotation (PR #21513 [S12]). KL catches the token-level drift that perplexity averages away [I].
- **SWA in llama.cpp.**
  - Cache reuse is not supported for Gemma 4, even with `--swa-full` [S13].
  - `--swa-full` combined with quantized KV makes VRAM grow as context grows [S14].
  - Concurrent-decode EOS loss and loops on gemma4 26B: seen on Ollama with 4 parallel slots, not reproduced in llama-server `-np 2` [S15][A].
  - CUDA garbling in specific builds: `-nkvo` with b8702+ [S16], and **CUDA 13.2 with IQ quants** (K-quants unaffected) [S17].
- **Weight quant.** No 31B KLD table was found. On Gemma 4 E2B: Q4_K_M KL 0.34, Q5_K_M 0.12, Q6_K 0.07 [S18][A]. Gemma 4 is described as more quant-sensitive than Qwen [S11].

## 3. Alternatives (fit in 32 GB)

| Model | Base | Notes |
|---|---|---|
| Artemis-31B **v1.2** | Gemma 4 31B | Cheapest swap. Same template and VRAM [S2][A] |
| Cydonia / Magidonia 24B v4.3 (Dec 2025) | Mistral Small 3.2 | Group chats and distinct voices praised, "tested 20k+" [S19][A]. Mistral v7 Tekken template |
| Qwen 3.5/3.6 27B finetunes (e.g. BlueStar) | Qwen 27B | ChatML, temp 0.8, min_p 0.05–0.075, rep pen 1.0–1.1. "Occasionally exhibits repetition" [S20]. Qwen tolerates KV quant far better [S11] |
| Orion-26B-A4B v1.1 | Gemma 4 26B MoE | temp ~0.9 [S21]. Gemma MoE is the most KV-quant-sensitive model tested (0.377 at q8_0) [S11]. Avoid with q8 KV |

On EQ-Bench creative writing (summarised 2026-09-27):
- Gemma 4 31B scores 80.1 on the rubric vs Mistral Small 3.2 at 71.6.
- Qwen3.8-27B has a much higher pairwise Elo.
- Longform: Gemma 56.5, Mistral Small 41.6.
- Users favour Gemma for consistency over long RP [S22][A].

## 4. Recommendations, ranked by expected impact on our two symptoms

Each one can be tested as an A/B on the recorded long prompts.

1. **Rework DRY. Likely the main cause of the merged words.** [I, mechanism from S23/S24]
   - llama.cpp's default order runs `penalties;dry;…;min_p;…` [S23], so min_p trims *after* DRY has pushed the natural continuation down.
   - With allowed_length 2 over 4096 tokens of stock phrasing, almost every 3-token phrase is penalised. That forces picks the model never preferred, which fits the chosen tokens sitting below 5% of the top token. DRY's author warns that it penalises legitimately repeated phrases and names [S24].
   - The `\n` breaker resets matching at every line break, so a short repeated line ("The valley is quiet.") never builds a long match. That explains why DRY did not stop the loop.
   - **Tests:**
     - (a) DRY off and everything else equal.
     - (b) allowed_length 3–4, multiplier ≤0.5.
     - (c) drop `"\n"` from the breakers.
     - (d) put `min_p` before `dry` in the sampler order.
2. **Switch KV from q8_0 to f16** [S11, S8].
   - Rough estimate: f16 KV costs about 80 KB per token on the global layers, so 196k context ≈ 16 GB and will not fit next to ~19 GB of weights [I, from S3 head counts; verify against the server log].
   - So cut to about 64–96k total context (2 slots × 32–48k).
3. **Add the empty thought channel to the template**: `last_output_sequence` = `<|turn>model\n<|channel>thought\n<channel|>`. Optionally wrap past model turns the same way [S9][S10]. Also matches the sheet's note that the Jinja template "is smoother" [S5][A].
4. **Samplers per the sheet**: temp 1.0, min_p 0.025–0.05 or top_k 64, nothing else. Then add one anti-repetition sampler at a time [S4][S5][A].
5. **Try Artemis v1.2** under the same settings [S2][A].
6. **Q5_K_M or Q6_K** if VRAM allows after step 2 [S18][A, proxy data].
7. **Controls.** `-np 1` with no `--kv-unified`, to rule out slot effects [S15][A]. Confirm the llama.cpp build is past the Gemma 4 fixes (PRs 21390/21488/21513/21566) and that CUDA is not 13.2 [S12][S17][S25]. Do not combine `--swa-full` with quantized KV [S14]. `--swa-full` itself has no evidence of helping quality [I].

## Sources
- S1 https://huggingface.co/TheDrummer/Artemis-31B-v1.1
- S2 https://huggingface.co/TheDrummer/Artemis-31B-v1.2 (and https://huggingface.co/TheDrummer/models)
- S3 https://sebastianraschka.com/blog/2026/gemma-4-release-notes.html , https://vast.ai/model/gemma-4-31b-it
- S4 https://huggingface.co/google/gemma-4-31B-it , https://unsloth.ai/docs/models/gemma-4
- S5 https://docs.google.com/spreadsheets/d/1wil6YEHTnQP3DO9EF35ImQMY3lbmRt5_ns-LJavUqwQ
- S6 https://featherless.ai/models/TheDrummer/Artemis-31B-v1.1
- S7 https://github.com/google-deepmind/gemma/issues/622
- S8 https://huggingface.co/google/gemma-4-31B-it/discussions/79
- S9 https://huggingface.co/google/gemma-4-31B-it/discussions/77
- S10 https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4 , https://huggingface.co/google/gemma-4-26B-A4B-it/discussions/42
- S11 https://localbench.substack.com/p/kv-cache-quantization-benchmark
- S12 https://github.com/ggml-org/llama.cpp/pull/21513
- S13 https://github.com/ggml-org/llama.cpp/issues/21468
- S14 https://github.com/ggml-org/llama.cpp/issues/23978
- S15 https://github.com/ggml-org/llama.cpp/issues/28917
- S16 https://github.com/ggml-org/llama.cpp/issues/21726
- S17 https://huggingface.co/unsloth/gemma-4-31B-it-GGUF/discussions/12
- S18 https://huggingface.co/dahus/gemma-4-e2b-Q6_K-GGUF
- S19 https://huggingface.co/TheDrummer/Cydonia-24B-v4.3
- S20 https://huggingface.co/zerofata/Q3.5-BlueStar-27B
- S21 https://huggingface.co/TheDrummer/Orion-26B-A4B-v1.1
- S22 https://github.com/Neroued/ninfer/issues/326 (cites eqbench.com and Reddit)
- S23 https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- S24 https://github.com/oobabooga/textgen/pull/5677
- S25 https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/discussions/4
