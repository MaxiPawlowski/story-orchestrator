export const VISUAL_PACKS_TOPIC = {
  "visual-packs": {
    title: "Visual packs",
    fields: "illustrations.packs, packs.style, packs.identities, packs.places",
    text: "illustrations.packs binds prepared art installed on this SillyTavern: identities {<cast id>: {id, digest}}, places {<checkpoint id>: {id, digest}}, "
      + "style {id, digest}. Bindings are written by a pack export, not by hand; the digest pins one pack revision, so a newer install never changes a running chat. "
      + "The stage shows a bound look without a builder, the cast scene uses it as its reference, and pictures copy its identity tags and place. "
      + "A missing or changed pack falls back to the text route and the picture records why. Traits and tags reach every picture: keep a secret form out of them.",
  },
} as const;
