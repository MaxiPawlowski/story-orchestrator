import type { BackdropTime, BackdropWeather } from "@engine/backdropSchema";

export type { BackdropTime, BackdropWeather };

export type BackdropBaseKind = "image" | "video";

export interface BackdropBase {
  kind: BackdropBaseKind;
  url: string;
  key: string;
  width?: number;
  height?: number;
}

export interface BackdropState {
  sceneKey: string;
  weather: BackdropWeather | null;
  timeOfDay: BackdropTime | null;
  tension: number;
  indoor?: boolean;
}

export interface BackdropLayerSpec {
  id: string;
  kind: string;
  params: Record<string, number | string | boolean>;
}

export interface BackdropAssets {
  depthUrl?: string;
  maskUrl?: string;
  loopUrl?: string;
}

export const BACKDROP_LOOP_TIERS = ["off", "cinemagraph", "lite", "full"] as const;
export type BackdropLoopTier = (typeof BACKDROP_LOOP_TIERS)[number];

export type BackdropGate = "effects" | "parallax" | "loops";

export interface BackdropSettings {
  enabled: boolean;
  effects: boolean;
  parallax: boolean;
  loops: BackdropLoopTier;
  intensity: number;
  dimBehindChat: boolean;
}

export interface BackdropCamera {
  x: number;
  y: number;
  zoom: number;
}

export interface BackdropFrame {
  time: number;
  dt: number;
  width: number;
  height: number;
  dpr: number;
  intensity: number;
  pointer: { x: number; y: number };
  camera: BackdropCamera;
  state: BackdropState;
  tint: [number, number, number];
  grade?: [number, number, number];
  reducedMotion: boolean;
}

export type BackdropMaskChannel = "sky" | "water" | "all";

export interface BackdropBaseModifier {
  depth?: { texture: WebGLTexture; offset: [number, number]; scale: number; focus: number };
  fog?: { texture: WebGLTexture; density: number; color: [number, number, number]; time: number };
  ripple?: { texture: WebGLTexture | null; channel: BackdropMaskChannel; amount: number; time: number };
  flow?: { texture: WebGLTexture; strength: number; time: number; period: number };
}

export interface BackdropLayerContext {
  gl: WebGL2RenderingContext;
  base: BackdropBase | null;
  assets: BackdropAssets;
  baseTexture(): WebGLTexture | null;
  baseSize(): { width: number; height: number };
  vertexShader: string;
  program(vertex: string, fragment: string): WebGLProgram;
  texture(url: string): Promise<WebGLTexture | null>;
  drawQuad(): void;
  coverTransform(): [number, number, number, number];
  bindScene(program: WebGLProgram, camera: BackdropCamera, unit: number): void;
}

export interface BackdropLayer {
  readonly kind: string;
  readonly order: number;
  readonly fps?: number;
  readonly usesAssets?: boolean;
  update?(spec: BackdropLayerSpec): void;
  adjustCamera?(camera: BackdropCamera, frame: BackdropFrame): BackdropCamera;
  modifyBase?(frame: BackdropFrame): BackdropBaseModifier | null;
  draw(frame: BackdropFrame): void;
  dispose(): void;
}

export type BackdropLayerFactory = (context: BackdropLayerContext, spec: BackdropLayerSpec) => BackdropLayer;

export interface BackdropAutoInput {
  state: BackdropState;
  assets: BackdropAssets;
  base: BackdropBase | null;
  settings: BackdropSettings;
}

export interface BackdropLayerOptions {
  gate?: BackdropGate;
  auto?: (input: BackdropAutoInput) => BackdropLayerSpec | null;
}

export interface BackdropBootContext {
  story(): import("@engine/index").NormalizedStory | null;
  checkpointId(): string | null;
  chatId(): string | null;
  tier(): BackdropLoopTier;
  settings(): BackdropSettings;
  hostGenerating(): boolean;
  subscribe(listener: () => void): () => void;
}

export type BackdropBootHook = (context: BackdropBootContext) => Promise<(() => void) | void>;

export type BackdropAssetLookup = (base: BackdropBase) => Partial<BackdropAssets> | null | Promise<Partial<BackdropAssets> | null>;

export interface BackdropAssetProvider {
  id: string;
  lookup: BackdropAssetLookup;
}
