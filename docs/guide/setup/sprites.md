# Sprite packs and changed looks

Open a story in Studio and choose **Sprites**. The member picker contains installed cards from that story's roster.

1. Choose an existing transparent PNG or upload a reference PNG.
2. Choose a separate output set name, using lowercase letters, digits and underscores.
3. Adjust the red head box to cover the face. Its coordinates are pixels in the reference, not the preview.
4. Discover ComfyUI, then select the diffusion model, text encoder and VAE for the supported edit recipe.
5. Generate an expression preview. Check identity and the expression, then **Keep this sprite**.

Pixels outside the face edit stay unchanged. Pixel checks catch missing transparency, blank images and framing
drift; they do not prove identity. Review the actual image before saving. Use a new set for a replacement pack.

Saving an expression remembers its reference setup for optional on-demand edits. It never edits the character card.
The generated set is available to story stage direction after a stage reload. Original/default packs remain intact.

## Reuse expressions you already have

You do not need to rebuild a good expression pack. In Studio › Sprites, discover the image-edit setup, select its
models, then choose **Reference pack** and **Use this expression pack**. The pack needs a neutral image and transparent,
non-blank expression PNGs. The check reads and fingerprints each image; it writes only the reference settings.
Original images never become generated assets and cannot be removed through generated-sprite cleanup.

Changed looks reuse the matching expression's pose and identity, falling back to neutral when that expression is absent.
A changed reference image makes a new cache key; an image changed during a render is refused rather than silently saved.

## Make a base when the character has no sprites

Discover the image-edit setup, then open **Build a base from character-card art**. Choose the installed background-removal
model and **Build four base candidates**. Review the face, clothing, framing and transparent edges, then keep one neutral
base. Reload the Sprites tab and use that base to build its expressions. Candidates are previews until you choose one.
Background removal needs an explicitly configured, installed model in the optional media plugin; nothing is downloaded.

## Blink and mouth

If the original neutral expression is not a suitable resting pose, choose **Closed-mouth neutral rest**. This
changes only the selected mouth region and keeps a complete transparent sprite. Preview it in a separate output
set; review the still image before using it as an animation reference. The original/default PNG is never edited.

Select the expression's own image as the reference. Generate **Blink frame**, **Mouth open frame**, and optionally
**Mouth half-open frame**. Use the same output set and expression label. Frames go into `anim-<set>` so ST never
mistakes them for ordinary expression sprites.

For a mouth frame, open **Mouth replacement region**. Green shows its patch inside the red head box. Keep the old
and new lip outlines and smile corners inside the opaque middle; feather only the surrounding skin. Coordinates
are relative to the head box. Each reference can keep its own adjustment while the tab stays open.

**Inspect the edit before compositing** shows the cropped reference and raw model edit, so a generated mouth can be
distinguished from a blending artifact. Adjusting only the mouth region reuses a bounded raw-edit cache in the open
builder; the image model is not called again. Closing the tab clears that cache. Model, reference, prompt, seed,
step count and resolution changes make a new render key.

**Render preset** sets the steps and edit resolution together. **Standard** (1024 px, 25 steps) is the default and
what reviewed packs use. **Fast preview** (512 px, 20 steps) is quicker but softer; review the face before keeping a
fast render. The builder remembers your choice, and you can still change **Steps** and **Edit resolution** (512, 768
or 1024) by hand. The setup you keep is what changed looks later render with. The saved frame retains the original
canvas size. Preview timing includes cleanup, with rendering reported separately.

The eyes and mouth use separate transparent patches, so blinking can overlap speech. **Mouth movement** defaults to
Simple: two frames, closed and open, switched while the reply streams. Smooth adds the half-open frame and falls
back to Simple if it is missing; Off keeps the mouth still. No frames means a static face that still breathes and
cross-fades. Both the browser's and ST's reduced-motion setting disable facial animation.

## Public changes inside one story

An author binds short public fields to ordinary extractor qualities:

```json
"card": {"fields": {"hair": {"quality": "current_hair", "visual": true}}}
```

Put that `card` object on a roster member (or `player`). Declare `current_hair` as a non-latching extractor string or
enum quality. A checkpoint may apply `effects.card: {"member_id": {"hair": "red"}}`. Later extraction or an author
edit wins; undoing a boundary restores the earlier value and its writer. A fresh chat has no applied change.

Illustrations read the applied public visual fields. Pre-rendered sprite rules may select a set using
`when.card: {"hair": ["red"]}`. **Current character state in replies** is a separate default-off switch.
Private knowledge belongs in the knowledge system, never in a public card field.
The local Artemis comparison kept this switch off by default: both tested placements agreed with every changed colour,
but the memory-only baseline was equally good in one of the two runs, so the repeatable-benefit condition was not met.

**Generate changed looks when needed** is off by default; turn it on per install when your stories change how people
look. It requires a saved or reused reference pack, ComfyUI and the media plugin, and it renders on your GPU without
asking. It renders the current expression first and keeps the old sprite visible while working, then builds that
look's blink and mouth frames from the new image, one at a time, letting a waiting reply go first between frames.
When they are done the stage animates the new look; a look built earlier is reused from its cache. A result that
arrives after the look changed again, or after you left the chat, is discarded. A rollback restores the old set;
cached generated files stay available. A new chat starts from the card as it was.

[Illustrations](images.md) · [Setup](README.md)
