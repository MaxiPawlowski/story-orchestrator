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

export const BACKDROP_TOPIC = {
  backdrop: { title: "Animated backdrop", fields: "effects.backdrop, backdrop_defaults",
    text: "Animated scene behind the chat; presentation only. {layers, weather, time, indoor, intensity, loop}; a beat overrides backdrop_defaults by field. "
      + "Absent = derived from state (weather quality, time_of_day, tension_current). layers: [] none, or kinds/{kind, intensity 0-1, speed 0.1-4, color hex, mask sky|water|none}: "
      + "rain snow embers dust fireflies fog flicker drift shimmer parallax depthFog. loop \"pre\" = make a video loop at setup (key places only), \"auto\" when idle, false = still." },
} as const;
