**The largest quality gain is likely to come from connecting illustrations to the accepted visual sources and current stage state.** Better text prompts will improve relevance, but they cannot reliably preserve the faces and outfits already shown on screen. The existing prepared-cast Qwen path is the best first experiment because much of its identity validation is already built.

Reviewed `2403c70f`, plus the 11a/11b preparation documents in `C:\dev\so-b1`. No files changed, builds/tests run, or local servers contacted. Findings below are static review; expected model gains remain hypotheses until rated.

**The most consequential findings are these.**

1. **Automatic illustrations have no visual identity conditioning.** The SDXL graph starts from an empty latent and receives text conditioning and optional LoRAs. It receives neither sprite images nor the background image. Random seeds compound variation, but fixing seeds would not resolve the missing identity input. [graph.ts:27](C:/dev/story-orchestrator/src/image/graph.ts:27), [runtime.ts:275](C:/dev/story-orchestrator/src/image/runtime.ts:275)

   The prepared-cast path provides the useful precedent: source lineage, current-look signatures, file hashes, model fingerprints and stale-result checks. Reuse that machinery when adding reference-backed automatic illustrations. [castSceneHost.ts:64](C:/dev/story-orchestrator/src/image/castSceneHost.ts:64)

2. **“Speaks or is mentioned” still does not mean “visible now.”** The latest fix removes the entire-group problem, but recent speakers survive even when disabled; mentioned characters enter through full-name or first-name matching. Discussion of an absent person, shared first names and a recent departure can therefore add the wrong subject. There is no subject-count limit or stage-visibility check. The player’s persona is also absent from this character list unless represented separately as a group member. [prompt.ts:48](C:/dev/story-orchestrator/src/image/prompt.ts:48), [image.ts:43](C:/dev/story-orchestrator/src/services/stHost/image.ts:43)

   The director returns `visible`, but the parser merely accepts strings and nothing uses that list to constrain rendering. This is advisory output, not enforced selection. [prompt.ts:94](C:/dev/story-orchestrator/src/image/prompt.ts:94)

3. **The fallback still cannot describe the current action.** It combines style, appearances, location, checkpoint label, lore and instruction; it does not summarize the target reply. A cadence request supplies an empty instruction. With no authored appearance, description-derived subjects are deliberately omitted from the template, so a relevant character can disappear entirely. [prompt.ts:33](C:/dev/story-orchestrator/src/image/prompt.ts:33), [runtime.ts:204](C:/dev/story-orchestrator/src/image/runtime.ts:204)

   The repaired profile addresses today’s cause, but an empty or deleted profile still takes this fallback. A valid profile that errors, or produces invalid JSON twice, instead fails the image. These are distinct states worth recording explicitly: **directed**, **intentional template**, **degraded template**, **failed**. [runtime.ts:242](C:/dev/story-orchestrator/src/image/runtime.ts:242)

4. **The director contract has unenforced parts.** `shot` is parsed but ignored when assembling the prompt; the route’s shot is appended instead. A director-selected wide composition can consequently receive a conflicting “cowboy” framing instruction. `useJsonSchema` is stored but not passed into the image-model call. Messages are truncated to their first 1,200 characters, potentially excluding the action at the end of a long reply. [prompt.ts:49](C:/dev/story-orchestrator/src/image/prompt.ts:49), [prompt.ts:117](C:/dev/story-orchestrator/src/image/prompt.ts:117), [runtime.ts:243](C:/dev/story-orchestrator/src/image/runtime.ts:243)

5. **Appearance sources can contradict each other.** Current appearance fields are appended as “overrides” after the old appearance; the final SDXL tag prompt must successfully remove the superseded details. Lore independently adds up to eight appearance lines without reconciling them against selected subjects or current looks. The narrator exclusion only filters cast subjects, not these separate lore lines. [cast.ts:42](C:/dev/story-orchestrator/src/image/cast.ts:42), [lore.ts:20](C:/dev/story-orchestrator/src/image/lore.ts:20)

   Prefer resolving one final appearance per identity before prompting. Keep identity traits, current outfit and temporary expression separate.

6. **Location naming is useful, but does not establish background fidelity.** The automatic path prefers a scene location fact, otherwise converts an authored background filename into words. It does not inspect the displayed background, and a stale location fact takes precedence over the authored fallback. [runtime.ts:220](C:/dev/story-orchestrator/src/image/runtime.ts:220), [cast.ts:25](C:/dev/story-orchestrator/src/image/cast.ts:25)

   Opening suppression checks whether stage/background effects were authored, not whether that presentation successfully appeared. It can suppress a useful opening picture when the stage is unavailable. [cast.ts:20](C:/dev/story-orchestrator/src/image/cast.ts:20)

7. **Prepared-cast illustrations preserve references, but lack automatic scene grounding.** Their prompt contains the supplied direction and current appearance fields. The default “current scene” instruction comes without transcript, location or background data. Only each character’s base image is uploaded—not the bust or reference-view pack. The graph supports two character references, leaving no implemented background-reference slot. [castSceneHost.ts:94](C:/dev/story-orchestrator/src/image/castSceneHost.ts:94), [castScene.ts:50](C:/dev/story-orchestrator/src/image/castScene.ts:50)

   Its validation is good groundwork, but enabling this path alone would solve only part of the owner’s goal.

8. **“Current look” and “currently displayed look” can differ.** The stage can use a nearest published look while preparing the requested one; prepared-cast rendering requires an exact current look, with a special allowance for face/decal layers. Consequently, an illustration can follow the intended outfit while the stage still shows a substitute. [stageBodies.ts:78](C:/dev/story-orchestrator/src/sprites/poses/stageBodies.ts:78), [castScene.ts:15](C:/dev/story-orchestrator/src/image/castScene.ts:15)

   Expose both states in one visual snapshot: intended appearance, displayed asset and whether it is a substitute. Otherwise “match the stage” and “match story state” remain competing requirements.

9. **The ST backend’s recorded render facts can be wrong.** The adapter passes positive and negative prompts to `/imagine`, but does not pass the route’s checkpoint, seed, dimensions, LoRAs or hires selection. The runtime nevertheless returns and records its calculated seed and dimensions, plus its selected checkpoint. Those are not evidence of what ST actually rendered. [stImage.ts:28](C:/dev/story-orchestrator/src/services/stHost/stImage.ts:28), [runtime.ts:311](C:/dev/story-orchestrator/src/image/runtime.ts:311), [runtime.ts:382](C:/dev/story-orchestrator/src/image/runtime.ts:382)

   This matters immediately for blind comparisons and reproducibility. Either control those settings explicitly or record the executed workflow/settings as authoritative, with unknown fields left unknown.

10. **Deduplication is narrower than the user’s experience of duplication.** It checks target-message media and pending target IDs. It cannot recognize two adjacent messages depicting the same moment. A picture posted separately does not mark its originating reply as illustrated. The four-reply judge cooldown is in memory, applies only to judge-positive selections, and is not updated by checkpoint pictures. The judge sees only the reply, so it cannot know that the stage or previous image already depicts it. [settings.ts:44](C:/dev/story-orchestrator/src/image/settings.ts:44), [runtime.ts:191](C:/dev/story-orchestrator/src/image/runtime.ts:191), [judgePicture.ts:6](C:/dev/story-orchestrator/src/image/judgePicture.ts:6)

11. **There are smaller reproducibility and lifecycle defects worth fixing before experiments.**

   - Fixed seeds and explicit route seeds ignore candidate index, so several candidates can be identical. [runtime.ts:275](C:/dev/story-orchestrator/src/image/runtime.ts:275)
   - Missing embeddings are silently removed; missing/incompatible configured LoRAs can be dropped with warnings that the rendering path does not surface. This changes the effective recipe. [runtime.ts:327](C:/dev/story-orchestrator/src/image/runtime.ts:327), [routing.ts:44](C:/dev/story-orchestrator/src/image/routing.ts:44)
   - Hires uses a second diffusion pass at denoise `0.4`; treat that as an identity-changing generation step, not harmless enlargement. [catalog.ts:54](C:/dev/story-orchestrator/src/image/catalog.ts:54)
   - Director planning receives no cancellation signal, and `direct()` starts with no transcript window. A rollback during planning can occur before there is a queued render to cancel; the final check only compares the target message, not all context consumed. [runtime.ts:339](C:/dev/story-orchestrator/src/image/runtime.ts:339), [runtime.ts:378](C:/dev/story-orchestrator/src/image/runtime.ts:378)
   - A queued job aborted before starting throws outside its cleanup block and remains in the queue’s job list. [queue.ts:15](C:/dev/story-orchestrator/src/image/queue.ts:15)

**For this hardware, measure the whole image→next-reply cycle.**

The quiet SDXL baseline is 7.84 seconds, but that is execution time. The newer controller record shows that preserving the member cache improved subsequent member replies while the first post-image reply still paid roughly a 23-second weight reload. That cache preservation was adopted; lower-memory streaming was not. Burst holding saved no reloads in the measured pattern. [plan 11:12](C:/dev/story-orchestrator/docs/plans/v3.0/11-image-perf-after-unlock.md:12), [plan 09:807](C:/dev/story-orchestrator/docs/plans/v3.0/09-controller-round-3.md:807), [plan 09:871](C:/dev/story-orchestrator/docs/plans/v3.0/09-controller-round-3.md:871)

Thus I would budget reference-backed generation as exclusive GPU work initially. Keeping the text process/cache alive in RAM is different from keeping its weights resident on the GPU. The existing SDXL measurements also do not establish that Qwen plus two references fits safely alongside the text cache on the 32 GB host.

These are the approaches I would compare:

| Approach | Expected consistency gain | Quality risk | GPU/latency and setup cost | Measure first |
|---|---|---|---|---|
| **Qwen edit using accepted current-look references** | High potential for one character; promising for two | Identity blending, pose copying, outfit omissions, scene/style drift | Lowest new integration cost; installed components. Recorded Qwen edits were about 27–34 s, but two-reference scenes need their own measurement. Expect text swapping | Match-to-sprite, two-person swaps, changed outfits, background fidelity, full cycle latency |
| **SDXL IP-Adapter Plus / Plus Face with regional masks** | Medium–high potential; especially useful if SDXL remains much cheaper | Reference composition leaks; attributes mix; Illustrious/NoobAI compatibility must be tested | New nodes, adapter weights and vision encoder; extra memory and attention work. Cache reference embeddings where supported | Weight sweep; one versus two subjects; both installed checkpoint families |
| **FaceID specifically** | Potentially strong for compatible faces | Anime face detection/identity discrimination may be inadequate; says little about outfits | More dependencies and embedding preparation; no safe co-residency assumption | First test detector coverage and same/different-character separation on the actual artwork |
| **Per-character LoRAs** | Potentially strong across poses once trained well | Overfits outfit/style; generated training views can reinforce identity errors; multi-LoRA bleeding | Highest preparation cost; dedicated offline training. Inference stays relatively close to SDXL | Held-out poses, outfits and lighting; unfamiliar two-character combinations |
| **Composite sprites onto the actual background** | Exact identity/outfit/background preservation before diffusion | Can look like a stage screenshot rather than a coherent illustration | CPU composition is cheap; no new model needed | Whether it adds value beyond the VN stage; lighting, scale, contact shadows |
| **Composite → masked img2img/inpainting** | High if faces/outfits are protected | More denoising improves integration while increasing identity drift | SDXL-class generation plus compositing/masking work | Denoise sweep; protected-face versus unrestricted edit; seam and lighting quality |
| **ControlNet from stage pose/depth/layout** | Strong spatial control; little identity gain alone | Freezes an unsuitable stage layout; pose errors propagate | Additional compatible weights and inference memory. `controlnet_aux` alone does not establish installed ControlNet weights | Pose/layout accuracy combined with a separate identity method |
| **Reference-only attention / regional text prompting** | Useful style/composition or attribute separation; weaker identity assurance | Style copying mistaken for identity; regional seams and leakage | Medium integration cost, implementation-dependent overhead | Cross-region attribute leakage and match-to-sprite |
| **One pinned checkpoint and style recipe** | Good style stabilization; limited identity gain | May worsen a purpose currently better served by another model | Low inference overhead; rebuilding existing sprites would be expensive | Blind comparison against accepted sprites, backgrounds and illustrations |
| **Fixed per-character seeds** | Little reliable identity gain across changed prompts/layouts | Repeated compositions and misleading confidence | Almost free | Use as a reproducibility control, not an identity solution |

IP-Adapter’s primary documentation supports separate reference conditioning, regional masks and reusable image embeddings; its FaceID variants use InsightFace rather than the same representation as Plus. My preference for testing Plus before FaceID here is an inference from the stylized artwork, not a measured result. [Diffusers IP-Adapter documentation](https://huggingface.co/docs/diffusers/main/using-diffusers/ip_adapter)

ControlNet supplies spatial conditions; it should complement identity conditioning. LoRA training is available for SDXL, but the accepted base/bust pair should be treated as the beginning of a curated training set, not automatically sufficient diversity. [ControlNet](https://github.com/lllyasviel/ControlNet), [SDXL DreamBooth/LoRA documentation](https://huggingface.co/docs/diffusers/en/training/dreambooth)

For the existing eight visual sources, **use accepted artwork as the identity authority**. A shared checkpoint is useful for future asset preparation, but regenerating accepted sprites merely to make every path use one checkpoint would be a large, unnecessary quality gamble.

**Pictures should earn their GPU turn by adding something the stage does not already show.**

I would replace independent trigger decisions with one illustration-intent decision per completed player turn:

- **Strong candidates:** a visually significant action, a consequential interaction, a reveal already visible to the player, or a new place whose composition is not adequately represented by the background.
- **Weak candidates:** ordinary dialogue, repeated reaction shots, internal checkpoint transitions, name mentions, and a location already shown clearly by the stage.
- **Opening:** wait for greeting, cast activation and stage setup to settle; allow at most one opening intent. Check actual presentation readiness.
- **Cadence:** make every-N an opportunity to assess a picture, not an obligation to render one. Preserve the owner’s ability to choose strict cadence.
- **Judge:** provide the proposed moment, current stage summary and last illustrated moment. Ask whether the picture adds visual information now.

Persist an intent containing the source-message revision, scene identity, selected subjects, look hashes, background identity and action. Merge checkpoint, scene and judge reasons into that intent. Deduplicate by moment as well as message; two different actions in the same location must still be distinguishable.

Use one pending automatic intent, coalescing superseded requests before rendering. Expire it when its source becomes stale. Count cooldown in completed player turns, not individual group-member replies.

Scheduling should let active/queued text and chained voices finish before image admission. Recheck at submission, not only at lease acquisition. For automatic images, use one candidate and opportunistic idle time; manual requests can offer alternatives. Once a render has begun, do not assume it can yield instantly—measure cancellation and recovery before promising that behavior.

**The evaluation should separate renderer quality, scene selection and scheduling.**

The existing plan-80 identity scores concern sprite/frame contact sheets. They are useful evidence for that pipeline, but do not establish cross-scene automatic-illustration identity or match-to-background. Its cost and timing floors also recorded misses. [plan 80:304](C:/dev/story-orchestrator/docs/plans/v2.8/80-image-quality.md:304)

I suggest this staged design:

1. **Small route pilot before broad implementation.** Compare current directed SDXL, Qwen references, and composite-based img2img on 12 frozen cases with two seeds each: **24 images per arm, 72 total**. Include close/full views, changed outfits, difficult lighting, two-character interactions and recognizable backgrounds. No best-of-N selection.

2. **Held-out confirmation for the best candidate.** Use eight identities:
   - Eight identities × three distinct scenes × three seeds: **72 single-character images per arm**.
   - Four pairs × two scenes × three seeds: **24 two-character images per arm**.
   - Total: **96 images per arm; 192 for control versus candidate**, containing 120 depicted identity instances per arm.

   Freeze scene descriptions and references before generating. Use matched seed lists for compatible SDXL arms; equal numeric seeds across Qwen and SDXL are labels for repeated trials, not equivalent noise experiments.

3. **Blind rating with references visible and method hidden.** Score separately:
   - Match to the accepted sprite: face, hair, proportions, distinguishing details.
   - Same-character consistency across the three scenes.
   - Current outfit and temporary appearance accuracy.
   - Action, cast count and background fidelity.
   - Style match, composition, anatomy and artifacts.
   - Overall preference and whether the picture was worth interrupting for.

   Shuffle A/B and hide the key. Include a small number of duplicate ratings to measure consistency. Use spoiler-free fixtures for the owner’s ratings; private campaign images go to the permitted second-model rater, with counts-only reporting.

4. **Automatic metrics support diagnosis.** Use cropped subject retrieval against all reference identities, separately for faces and bodies; record detector failures explicitly. CLIP-style similarity can reward shared clothing, palette or background, so whole-image similarity cannot certify identity. Calibrate embeddings against blind same/different-character labels before setting thresholds. For two people, explicitly score identity assignment and swaps.

Suggested **new, predeclared** confirmation floors:

| Dimension | Proposed floor |
|---|---|
| Sprite identity | ≥90% judged same character overall; ≥80% for every identity |
| Two-character assignment | Zero swaps/merges in the 24 pair images |
| Outfit and scene fidelity | ≥90% correct on each measure |
| Visual quality | No category mean worse than control by more than 0.2 on a five-point scale |
| Preference | Candidate wins ≥60% of non-tied comparisons; report uncertainty clustered by scene |
| Reliability | Zero wrong-chat/stale-reference placements, OOMs or refused text requests |
| Duplication | Zero duplicate placements across the scripted overlap cases |

These are screening/adoption proposals, not proof of universal reliability. If uncertainty spans the declared margin, call the result inconclusive; use a predeclared extension set rather than changing the floor.

Finally, run the actual browser journey twice on a frozen build, on an isolated lane during an authorized GPU window. Exercise startup, overlapping cues, departure/mention cases, outfit changes, missing references, missing profile, rollback, cancellation and a new player send during image work.

Record prompt-planning time, queue wait, text unload/wake, image execution, save/display time, next-reply TTFT, cache retention, peak dedicated/shared GPU memory and minimum available RAM. Include both immediate-next-send stress and realistic reading gaps. Keep performance changes separate from identity-method changes so the blind result has an interpretable cause.

**Ranked changes, by expected impact × confidence / cost:**

1. **Create one resolved visual-scene snapshot shared by stage and illustrations.** Very high impact, high confidence, medium cost. Selected identities, intended/displayed looks, actual background and source revisions become explicit.
2. **Pilot Qwen reference-backed automatic scenes for one or two characters.** Highest likely identity gain, medium confidence, moderate cost because the core path exists. Adopt only after blind comparison.
3. **Unify illustration intents and semantic deduplication.** High impact on both usefulness and latency, high confidence, medium cost. Replace multiple independent triggers with one decision about one moment.
4. **Fix executed-render provenance and director-contract gaps.** High confidence, low–medium cost. Truthful ST metadata, applied framing, validated subjects, visible fallback state and distinct candidate seeds make evaluation trustworthy.
5. **Benchmark full image/text cycles with the adopted cache-preservation behavior.** High performance impact, high confidence in the need, moderate measurement cost. Avoid assuming burst holding or faster kernels solve the first-reply delay.
6. **Test sprite/background composition with protected-region img2img.** Strong stage-match potential, medium confidence, moderate cost; especially useful for scenes beyond the current two-reference limit.
7. **Test masked IP-Adapter Plus on the chosen SDXL checkpoint.** Promising lower-cost recurring generation, medium confidence, higher setup cost. Test FaceID only after validating it on the artwork.
8. **Defer character LoRAs, elaborate ControlNet stacks and rebuilding the asset style.** Potentially valuable later, but expensive before the reference-based routes establish what remains unsolved. Fixed seeds belong in reproducibility tooling, not the identity strategy.