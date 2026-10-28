export const VISUAL_PACKS_TOPIC = {
  "visual-packs": {
    title: "Visual packs",
    fields: "illustrations.packs, packs.style, packs.identities, packs.places",
    text: "illustrations.packs binds prepared art installed on this SillyTavern: identities {<cast id>: {id, digest}}, places {<checkpoint id>: {id, digest}}, "
      + "style {id, digest}. A pack export writes bindings; the digest pins one revision, so a newer install never changes a running chat. "
      + "The stage shows a bound look, the cast scene and automatic scenes of one or two prepared characters use it as reference, and pictures copy its tags and place. "
      + "A missing or changed pack falls back to the text route and the picture records why. Traits and tags reach every picture: keep secrets out. "
      + "Tags and recipes key by route family id (sdxl-illustrious, sdxl-noobai, tags also default); illustrious is refused.",
  },
} as const;
