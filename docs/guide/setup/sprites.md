# Sprite packs and changed looks

Open a story in Studio and choose **Sprites**. The member picker contains installed cards from that story's roster.

## Where the stage looks for sprites

Like SillyTavern's Character Expressions, the stage reads a character's sprites from the folder named after the
character (`characters/<name>/`), or from the folder an expression override in Character Expressions names. A
`folder` in the card's `so_sprites` block wins over both. Base sprites are the files named after their label
(`happy.png`); a frame file such as `happy.blink.png` never becomes the base face, and animation frames live in
`anim-<set>` folders.

**SillyTavern's Character Expressions.** It may stay on. While the stage shows for a story with sprites,
SillyTavern's own expression picture (and its Visual Novel sprites) is hidden, and it comes back when the stage is
not showing; SillyTavern's settings are never changed. The Setup list says when both are on.

**Phones.** Below 768 px wide the stage always shows as the strip above the chat, with or without `/vn`.

When a story directs a stage and a character it shows has no pack, no sprites in its folder, or no sprite for a face
or set a turning point asks for, the author's Setup list names it (*stage-pack-missing*), and Studio warns about a
face or set that the installed packs do not have.

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
**Mouth half-open frame**, **Mouth rounded frame (oh)** and **Mouth wide frame (ee)**. Use the same output set and
expression label. Frames go into `anim-<set>` (`neutral.mouth_o.png`, `neutral.mouth_wide.png` beside
`neutral.talk.png`) so ST never mistakes them for ordinary expression sprites. The rounded and wide frames use the same
mouth region, mask import and checks as the other mouth frames.

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

Before a generated frame is kept, the builder imports only the area inside its mask. It corrects a whole-image shift
of up to 3 px, rescales a result that kept the head box's shape, removes a colour tint measured just inside the mask
edge and keeps the reference's transparency. It refuses an edit that redrew the picture outside the mask, spills over
the mask edge, moved more than 3 px or came back at a different aspect ratio, and says which. Render it again, or
widen the mouth region if the new mouth is larger than the old one.

The eyes and mouth use separate transparent patches, so blinking can overlap speech. While a reply streams, the
mouth follows the words: the English text is read as mouth shapes as it arrives, with no audio, and a shape is held
briefly so it does not flicker. **Mouth movement** defaults to Simple: two frames, closed and open, opened on vowels.
Smooth also uses the extra mouth frames the pack has: half-open for short and narrow sounds (eh), rounded for oh and oo,
wide for ee. A missing shape uses the nearest frame there is (rounded falls back to open, wide to half-open), and with
only the open frame Smooth behaves like Simple; Off keeps the mouth still. Until the lip-sync rules load, the mouth flaps at a steady pace. No frames means a static face
that still breathes and cross-fades. Both the browser's and ST's reduced-motion setting disable facial animation.

## Public changes inside one story

An author binds short public fields to ordinary extractor qualities:

```json
"card": {"fields": {"hair": {"quality": "current_hair", "visual": true}}}
```

Put that `card` object on a roster member (or `player`). Declare `current_hair` as a non-latching extractor string or
enum quality. A checkpoint may apply `effects.card: {"member_id": {"hair": "red"}}`. Later extraction or an author
edit wins; undoing a boundary restores the earlier value and its writer. A fresh chat has no applied change.

Illustrations read the applied public visual fields. Pre-rendered sprite rules may select a set using
`when.card: {"hair": ["red"]}`. **Current character state in replies** is a separate switch, on by default, under
Characters › Added to the reply prompt.
Private knowledge belongs in the knowledge system, never in a public card field.
The local Artemis comparison did not show a repeatable benefit: both tested placements agreed with every changed colour,
but the memory-only baseline was equally good in one of the two runs. It is on by default all the same (2026-10-09).

**Generate changed looks when needed** is on by default; it does nothing until a reference pack is set up for a
character, and you can turn it off per install. It requires a saved or reused reference pack, ComfyUI and the media plugin, and it renders on your GPU without
asking. It renders the current expression first and keeps the old sprite visible while working, then builds that
look's blink and mouth frames from the new image, one at a time, letting a waiting reply go first between frames.
When they are done the stage animates the new look; a look built earlier is reused from its cache. A result that
arrives after the look changed again, or after you left the chat, is discarded. A rollback restores the old set;
cached generated files stay available. A new chat starts from the card as it was.

## Live close-shot heads

**Live close-shot head** is on by default. With an imported rig for the member's current look,
a close shot adds small head turns, gaze, blinking, breathing and mouth movement while the reply
streams. Other shots use the usual sprites. Missing or failed rigs keep the static sprite;
reduced motion and the story's motion switch stop movement.

**Drawn eyes and mouth on the live head** is on by default. When the look's neutral expression has
blink and mouth frames (the same `neutral.blink.png`, `neutral.talk.png`, `neutral.talk2.png`,
`neutral.mouth_o.png` and `neutral.mouth_wide.png` the plain sprite uses), the live head crops them to the
bust with the accepted head box and swaps the drawn closed eyes in during a blink and a drawn mouth in
while a reply streams. On the live head the mouth follows the same text mouth shapes and the same
fallbacks as the plain sprite (oo is the rounded frame narrowed, eh the half frame widened). They follow the
head's turns, tilt and breathing. A frame whose edge does not line up with the artwork, or whose size
does not match the rig, is skipped; with no usable frames the head keeps its own eyes and mouth.
Changing a frame file rebuilds the drawn layer on the next close shot.

Without a usable drawn mouth the head has only its closed lips to move, so it opens them a little,
smoothly, on vowels instead of stretching them. A rig whose mouth points have no width or fall
outside the face keeps its mouth still; Author view says so when that rig is imported or previewed.

In Author view, Images → Sprite stage lists rig present or missing per member and selected look.
Open **Import a live head rig**, paste the rig package JSON and select **Import rig**. The package
must match that member, look and neutral artwork. Changed artwork requires a new rig. Creating
a rig requires a calibrated vision authoring session; it does not happen during play.

[Illustrations](images.md) · [Setup](README.md)
