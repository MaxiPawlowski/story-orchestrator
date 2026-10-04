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

## Blink and mouth

Select the expression's own image as the reference. Generate **Blink frame**, **Mouth open frame**, and optionally
**Mouth half-open frame**. Use the same output set and expression label. Frames go into `anim-<set>` so ST never
mistakes them for ordinary expression sprites.

The eyes and mouth use separate transparent bands, so blinking can overlap speech. Mouth movement offers Off,
Simple and Smooth; Smooth falls back to Simple if a half-open frame is missing. No frames means a static face.
Both the browser's and ST's reduced-motion setting disable facial animation.

## Public changes inside one story

An author binds short public fields to ordinary extractor qualities:

```json
"card": {"fields": {"hair": {"quality": "current_hair", "visual": true}}}
```

Put that `card` object on a roster member (or `player`). Declare `current_hair` as a non-latching extractor string or
enum quality. A checkpoint may apply `effects.card: {"member_id": {"hair": "red"}}`. Later extraction or an author
edit wins; undoing a boundary restores the earlier value and its writer. A fresh chat has no applied change.

Illustrations read the applied public visual fields. Pre-rendered sprite rules may select a set using
`when.card: {"hair": ["red"]}`. **Current character state in replies** is a separate default-off switch while its
model measurement is pending. Private knowledge belongs in the knowledge system, never in a public card field.

**Generate changed looks when needed** is off by default. It requires a saved Studio base pack, ComfyUI and the
media plugin. It renders the current expression first and keeps the old sprite visible while working. A rollback
restores the old set; cached generated files stay available.

[Illustrations](images.md) · [Setup](README.md)
