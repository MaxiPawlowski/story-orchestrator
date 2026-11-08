export const BACKDROP_WEATHERS = ["clear", "rain", "storm", "snow", "fog", "wind"] as const;
export type BackdropWeather = (typeof BACKDROP_WEATHERS)[number];

export const BACKDROP_TIMES = ["dawn", "day", "dusk", "night"] as const;
export type BackdropTime = (typeof BACKDROP_TIMES)[number];

export const BACKDROP_LAYER_KINDS = ["rain", "snow", "embers", "dust", "fireflies", "fog", "flicker", "drift", "shimmer", "parallax", "depthFog"] as const;
export type BackdropLayerKind = (typeof BACKDROP_LAYER_KINDS)[number];

export const BACKDROP_MASKS = ["sky", "water", "none"] as const;
export type BackdropMask = (typeof BACKDROP_MASKS)[number];

export const BACKDROP_LOOPS = ["pre", "auto"] as const;
export type BackdropLoop = (typeof BACKDROP_LOOPS)[number] | false;

export const BACKDROP_SPEED_MIN = 0.1;
export const BACKDROP_SPEED_MAX = 4;

export interface BackdropLayerEntry {
  kind: BackdropLayerKind;
  intensity?: number;
  speed?: number;
  color?: string;
  mask?: BackdropMask;
}

export interface BackdropEffect {
  layers?: BackdropLayerEntry[];
  weather?: BackdropWeather;
  time?: BackdropTime;
  indoor?: boolean;
  intensity?: number;
  loop?: BackdropLoop;
}

export type BackdropDefaults = BackdropEffect;
