# Image generation troubleshooting

Symptom → likely cause → fix. `(v)` = verified in source (paths per `../SKILL.md`), `(c)` = community
report. When asking for help or filing a flag, state the image source, the text API/model and the preset.

## Nothing happens / errors

| Symptom | Cause | Fix |
|---|---|---|
| Toast "Image generation is not available" | source not configured. A fresh install is on *Extras API (deprecated)* (v: sd/index.js:234, settings.html:51, index.js:2995-2998) | pick a real source under Image Generation and validate the URL/key |
| "SD prompt text generation failed" / "Prompt generation produced no text" | the LLM step failed or returned nothing. Often a broken instruct template, a refusal or a filter (v: sd/index.js:3084-3088, 3296-3300) | try `/sd` with a free-mode prompt to separate image from text problems; check the instruct template; retry or switch models |
| "Chat changed, generated image discarded" | you switched chats mid-generation (v: sd/index.js:3438-3442) | stay in the chat |
| Script stops at a popup | "Edit prompts before generation" is on (v: sd/index.js:814-870) | pass `edit=false` in scripts |
| `Novel API returned error: 400 … min_length` | the **text** profile points at NovelAI (c, 2025-08) | fix the `Image_Generation` connection, not the image source |
| NAI "Internal server error" | 0 Anlas / no subscription (c, 2025-08) | check the ST server console |
| NAI 4.5 Full "missing" | old ST. It is in the release list now (v: sd/index.js:2460) | update ST; the "switch to staging" advice is obsolete |
| `/dom` error, background never changes | LALib not installed, and its `#bg_custom` target no longer exists (v: public/index.html:53) | use `/sd background`, see `prose-to-prompt.md` |
| Sorcery never fires | third-party extension disabled, streaming off, or other Sorcery scripts interfering (c, 2025-08) | prefer a QR `executeOnAi` trigger |

## Wrong model / wrong preset after an image

| Symptom | Cause | Fix |
|---|---|---|
| Character now only answers with tag lists | still on the image profile. Usually the restore went to `<None>`, which applies nothing (v: cm/index.js:921-935, 738-742) | save the roleplay connection as a profile; use the guarded script in `prose-to-prompt.md` |
| Preset "goes back to some other preset" | `/preset` fuzzy-matched a missing or misspelled name (v: preset-manager.js:955-975) | exact names; verify with `/preset` (no argument) |
| Loading the tag preset changes source/model too | *Bind presets to API connections* is on (v: openai.js:516, 5046-5048) | turn it off, or bake the preset into the profile |
| Tag preset "not loading properly" | a CC-only preset on a text-completion profile (c, 2025-08) | use a Chat Completion profile |
| Another extension's call runs on the image profile | it fired during the swap window (qvink memory reported) (c, 2025-08) | delay that extension, or avoid swapping (`/profile-genstream profile=…`, v: cm/index.js:1050-1058) |

## Bad or off-topic images

| Symptom | Cause | Fix |
|---|---|---|
| Image unrelated to the scene | the LLM censored or refused the prompt step (c) | inspect the prompt (`edit=true`); change the model |
| Weights or markers vanished from the LLM prompt | `processReply` strips everything outside `a-zA-Z0-9.,:_(){}<>[]/-'|#` (v: sd/index.js:2916) | `processing=minimal`, or go through free mode |
| Character tags appear twice | `{{charPrefix}}` in the common prefix **and** a mode that adds the char prefix (v: sd/index.js:3318-3333) | remove the macro from the common prefix, or use free mode |
| Character tags missing | group chat (the prefix is empty there, v: sd/index.js:934-946), or free/`background`/`me` mode (v: sd/index.js:3318) | start the free prompt with `char `, or put tags in the prompt |
| Negative prompt ignored | backend doesn't take one: OpenAI, AI/ML, HF, Electron Hub, BFL, Z.AI, OpenRouter (v: sd/index.js:3339-3421) | move constraints into the positive prompt |
| Common prefix "not applied" | not reproducible in source; the prefix is combined for every source (v: sd/index.js:3323-3332) | check `{prompt}` uses **single** braces; check the style didn't reset it |
| Only one character drawn / all look alike | multi-subject limits of tag models; NAI per-character prompts not sent (v: src/endpoints/novelai.js:356-372) | one subject per image; per-card LoRAs in a group chat |
| LoRA output low quality | natural language in a booru/LoRA prompt (c, 2025-08) | booru-only instructions; a reasoning model |
| Text or watermarks in the image | junk tags from the LLM (c) | inspect the tags; add `no text` / watermark tags to the negative |
| Gemini "empty candidates" | incomplete generation or filtering (c, 2025-08) | retry; repeated = filtered |

## Automation misfires

| Symptom | Cause | Fix |
|---|---|---|
| Endless images | auto QR without *Don't trigger auto-execute*; the posted image re-fires `executeOnAi` (v: sd/index.js:4997-4999, qr/src/AutoExecuteHandler.js:16-31) | tick `preventAutoExecute` |
| Image arrives before the reply | WI-automation trigger. It runs during prompt assembly (v: world-info.js:900-903) | by design; use `executeOnAi` if you want after |
| Continue fires the image again | WI re-scan on Continue (c, 2024-08) | Generation Triggers = Normal, or the `{{lastMessageId}}` guard |
| Marker instruction leaks into the tag call | constant entry; secondary keys ignored for constants (v: world-info.js:4892-4896) | Generation Triggers = Normal on the marker entries |
| Tag lorebook bloats every roleplay prompt | always-on book (c, 2026-01) | Generation Triggers = Quiet (v: world-info.js:4806-4812) |
| Normal text gen degrades once images are frequent | images or captions in history sent to the model (c, 2025-08) | keep image messages hidden (the default for command-initiated ones, v: sd/index.js:4985, 5009-5028); turn off *Send inline media* (renamed from "Send inline images", v: openai.js:4286) |

## Sprites

| Symptom | Cause | Fix |
|---|---|---|
| Sprite never changes | classifier API = None (the fresh default, v: expr/index.js:2219-2221) | pick Local or LLM |
| Custom label never shows its file | the label contains `-`; the server cuts labels at the first `-`/`.` (v: sprites.js:138) | letters-only (or `_`) labels |
| `/expression-upload label=my_label` lands as `mylabel` | non-letters stripped (v: expr/index.js:918) | letters-only labels |
| Sprites not found for a character | folder named after the **display name**, not the avatar file (v: expr/index.js:625-636) | rename the folder, or `/costume <folder>` |
| Only one sprite visible in a group | VN mode off, or on mobile (v: expr/index.js:136-138) | enable VN mode (desktop); multi-sprite extensions for 1:1 chats |
| Regex illustration shows a broken image | external media blocked by default (v: power-user.js:336) or wrong filename/case | allow external media for that character; match the file names to the keywords exactly |
