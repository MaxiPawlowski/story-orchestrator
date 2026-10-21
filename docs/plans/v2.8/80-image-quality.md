# 80 — Image quality: resolution, edges, eye whites, frame QA

Owner 2026-10-21: the image path works end to end (plan 41/79) but the quality is not good enough: rough edges,
see-through eyes, frames that pass QA while wrong. Part of v2.8. Branch `v2.8-image-acceptance-followup` (not merged
until the owner says so).

## Measured baseline (2026-10-21, showcase run `showcase1021b`, raw images in the private showcase folder)

- A base render comes out about 832×1248 (Qwen-Image 2.1 int8, resolution 1024) and `composeEdit` resizes it to the
  reference box, the full card: SillyTavern stores card art at 400×600. Every later step inherits 400×600.
- Busts are 286–317 px wide; an eye is 17×16 px (Ash), 18×9 px (Bram), 21×21 px (Cleo).
- Edges: 1,765–2,384 semi-transparent pixels per sprite, of which 279–928 are bright (> 200 mean): background
  colour left in the matte. All four expressions reuse the base's alpha mask exactly.
- Frames: Cleo's blink closes one eye and passed QA; Bram's blink shows a darker rectangle where the edit box was.
  The deterministic 4–5 px shift refusals of 2026-10-18 reappear whenever the head box falls back to the fraction.
- Live head: the eye-white tone is sampled from pale, low-chroma pixels (`scleraTone`); on shaded or tinted
  eye whites it returns nothing and a gaze slide has no plate behind the iris.

## Stages

1. **B — bench (CPU, first).** `scripts/debug/so-image-bench.mts` over a folder of raw journey outputs: per image
   size, eye size in the bust, halo score, holes, seam score, per-eye openness, eye-white coverage; contact sheets
   for the second-model rater. Before/after numbers for every stage below come from it.
2. **R — resolution.** A base keeps its rendered size instead of the card's: the base output box is the render's
   aspect fitted to the reference, scaled to the rendered pixels (long edge 1248 at resolution 1024). Expressions,
   frames, busts, rigs, poses and looks follow from the base. The card stays 400×600; display scales down. Saved
   head boxes, visual sources and rigs are size-checked, so mixed old/new sizes are refused, never stretched.
3. **E — edges.** Matte at full size; decontaminate semi-transparent pixels (remove the estimated background colour);
   tighten the alpha by about one pixel; render bases on a flat neutral background. Halo score in QA.
4. **W — eye whites.** At rig time, an opaque eye-white plate inside each eye outline (sampled sclera, near-white
   fallback). A gaze slide never reveals transparency.
5. **Q — frame QA.** Blink: both eyes' openness from the rig's eye landmarks must drop. Seam/tone check along the edit
   border. Feathered blend with colour matching. A shift refusal aligns first, then one automatic re-render with a
   new seed.
6. **C — cost cuts (owner 2026-10-21).** Measured on `showcase1021b`: 59 ComfyUI renders, about 27 s each (about 27 min
   of image GPU time) in an 85-minute run; preparing three characters took 14.5 min.
   - **C1, fewer base candidates.** Today 4 are rendered and the first QA-passing one is kept: 9 of 12 base renders
     are thrown away. Render one; render the next only when QA refuses it (author's "more candidates" stays available).
   - **C2, prepare poses before play.** Poses the story's checkpoints name (and the stand-in look) are rendered in the
     preparation pass, not when the stage first asks during a turn. A pose still missing at play time renders only
     when no loud generation is running or queued.
   - **C3, reuse face frames across poses.** A posed body with the base's face reuses the base's blink/talk frames,
     warped through the head boxes, instead of two new renders. It renders new frames only when the reused frames fail
     the drawn-frame guard.
7. **A — acceptance (3090).** The plan 41 §5 journey twice on one frozen build with the floors below.

## Floors (predeclared 2026-10-21, before any run)

Informational, as always: a miss is recorded, never retuned.

- R: bust eye width ≥ 40 px for every member; base sprite long edge ≥ 1,200 px.
- E: bright semi-transparent pixels ≤ 25 % of the 2026-10-21 baseline per member (≤ 70 / 232 / 69 for Ash/Bram/Cleo
  at baseline size, scaled by edge length at the new size).
- W: zero pixels with alpha < 0.9 inside either eye outline at gaze (−1..1, −1..1) in 0.25 steps, all members.
- Q: every accepted blink frame closes both eyes (each eye's open height ≤ 35 % of neutral); seam score ≤ the bench's
  threshold set in stage B before stage Q is built; no accepted frame with a visible edit rectangle in the rater sheet.
- Rater (Sol, contact sheets, ≤ 60 calls): identity same-character ≥ 90 %; edge/eye defects flagged on ≤ 1 of 12
  sheets.
- C1: base renders per member ≤ 1.5 on average across both runs (baseline 4).
- C2: zero image renders started while a loud generation is running; every pose the story names is ready before the
  first play turn.
- C3: frames on posed bodies with the base face: zero new renders; every reused frame passes the drawn-frame guard.
- Cost: ComfyUI renders per run ≤ 35 (baseline 59) at the same step coverage; character preparation ≤ 9 min for three
  members (baseline 14.5).
- Journey: every §5 step passes, both runs, GPU idle measured with no browser of ours drawing.

## Not in scope

- A larger model: Qwen-Image is 20B; bf16 does not fit in 24 GB and fp8 is unsupported on the 3090.
- The live-head renderer rewrite; only the eye plate changes.

## Unresolved questions

- Should the card art itself be replaced by the full-size base (cards are 400×600 in SillyTavern)? Proposed: no.
- Long edge 1248 or a 2× upscale step (more VRAM per edit)? Proposed: render size first, measure, then decide.
