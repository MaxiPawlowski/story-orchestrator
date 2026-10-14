import type { Feature } from "./registry";
import { drawerAt, settingsAt, studioAt } from "./where";
import { authorGuideDoc } from "./guideLinks";

export const IMAGE_FEATURES: readonly Feature[] = [
  {
    id: "live-head", name: "Live close-shot head", area: "images", audience: "setup",
    oneLine: "A rigged close shot breathes, blinks and talks as a reply streams.",
    what: "Import a rig for a member's look in Author view. Close shots animate in the page; missing rigs keep the static sprite. Reduced motion stops movement. "
      + "When the look has blink and talk frames, the head swaps in those drawn closed eyes and open mouths.",
    where: settingsAt("#so-live-head-enabled", "Images › Sprite stage › Live close-shot head"),
    settings: [], doc: "setup/sprites.md", status: "experimental", needs: ["sprite-pack"],
    isOn: (settings) => settings.sprites.liveHead,
  },
  {
    id: "prepared-presentation", name: "Prepared cast presentation", area: "images", audience: "author",
    oneLine: "Review and accept each character's base and bust before sprites, poses and live heads use them.",
    what: "After the wizard builds a cast, pick a generated base, set its head box and accept base and bust together. "
      + "Expressions, changed looks and poses follow that accepted source; a changed card or artwork asks for a new review. "
      + "The wizard's character cards show the accepted bust and base, or a placeholder with Prepare presentation.",
    where: studioAt("#so-prepare-presentation", "Sprites › Prepare presentation"), settings: [], guideTopic: "poses", doc: authorGuideDoc("poses"),
    status: "experimental", needs: ["comfyui"],
  },
  {
    id: "reference-pack", name: "Reference views", area: "images", audience: "author",
    oneLine: "Draw an accepted character three-quarter left and right, in profile and from behind, then accept or cancel all six views.",
    what: "Optional. The accepted base and bust fill the full-body and front slots; the other four views come from the same Qwen edit route. "
      + "Accepting stamps the pack hash into every later sprite, pose, look and scene key, so changed looks render again.",
    where: studioAt("#so-reference-pack", "Sprites › Reference views"), settings: [], guideTopic: "poses", doc: authorGuideDoc("poses"),
    status: "experimental", needs: ["comfyui"],
  },
  {
    id: "changed-look-rebuild", name: "Changed-look bust and rig", area: "images", audience: "author",
    oneLine: "Rebuild a changed look's bust and live-head rig, then accept or cancel.",
    what: "A look whose artwork changed shows static art in close shots. Rebuild crops its bust with the accepted head box and fits a rig to face "
      + "landmarks read by the Sol vision model; you see both and the moving preview before anything is saved.",
    where: studioAt("#so-changed-look-rebuild", "Sprites › Changed-look bust and rig"), settings: [], guideTopic: "poses", doc: authorGuideDoc("poses"),
    status: "experimental", needs: ["sprite-pack", "harness-plugin"],
  },
  {
    id: "landmark-cross-check", name: "Face landmark cross-check", area: "images", audience: "author",
    oneLine: "A local face detector double-checks the vision model's eyes, mouth and jaw before you accept a rebuilt rig.",
    what: "When the optional landmark server runs, Rebuild bust and rig also reads the bust with an anime face detector on the CPU and "
      + "warns when an eye, the mouth or the jaw sits far from where the vision model placed it. It never blocks; without the server the review says it was skipped.",
    where: studioAt("#so-changed-look-rebuild", "Sprites › Changed-look bust and rig"), settings: [], guideTopic: "poses", doc: authorGuideDoc("poses"),
    status: "experimental", needs: ["sprite-pack"],
  },
  {
    id: "cast-illustration", name: "Prepared cast illustration", area: "images", audience: "setup",
    oneLine: "Draw one or two prepared characters together in their current looks.",
    what: "Choose up to two characters whose presentation was accepted. "
      + "The picture uses each one's current look; a look still being prepared is refused rather than drawn in the old outfit.",
    where: drawerAt("#so-cast-scene", "Author › Illustrate prepared cast"), settings: [], doc: authorGuideDoc("poses"),
    status: "experimental", needs: ["comfyui", "story"],
  },
  {
    id: "pose-library", name: "Poses and character layers", area: "images", audience: "author",
    oneLine: "Direct a body pose and let looks change with the story.",
    what: "Choose from 40 original skeletons, add story or install poses, and bind visual card fields to base, face or decal edits. Bodies render on first need and swipes restore the applied choice.",
    where: studioAt("#so-studio-poses", "Sprites › Poses"), settings: [], guideTopic: "poses", doc: authorGuideDoc("poses"), status: "shipped",
    needs: ["sprite-pack"], isOn: (settings) => settings.sprites.poses,
  },
  {
    id: "backgrounds", name: "Backgrounds", area: "images", audience: "author",
    oneLine: "A turning point can switch the chat background.",
    what: "A story can name a background for each turning point; it is applied when the story gets there and again when the chat reopens.",
    where: studioAt("#so-studio-modal", "Turning point › Effects"),
    settings: [], guideTopic: "background", doc: authorGuideDoc("background"), status: "shipped",
  },
  {
    id: "story-scenario", name: "Story scenario", area: "world", audience: "author",
    oneLine: "A turning point can set the chat's scenario text, in place of every character card's own.",
    what: "A story can give a turning point a scenario: one short framing text that stands in for every member card's scenario in a group, and follows the "
      + "story as it moves. A scenario typed into the chat by hand is left alone. When a story sets none, the author view names the cards whose scenarios frame the chat.",
    where: studioAt("#so-studio-modal", "Turning point › Effects › Scenario"),
    settings: [], guideTopic: "scenario", doc: authorGuideDoc("scenario"), status: "shipped", needs: ["group-chat", "story"],
  },
  {
    id: "images", name: "Illustrations", area: "images", audience: "setup",
    oneLine: "Draws scenes and characters through your image service.",
    what: "Uses SillyTavern’s image service by default. Stories can ask for pictures, or you can draw by hand. An optional prompt model improves the scene description; a template works without it.",
    where: settingsAt("#so-image-settings", "Images › Image service"),
    settings: ["image"], guideTopic: "presentation", doc: "setup/images.md", status: "shipped", needs: ["group-chat"],
    isOn: (settings) => settings.image.enabled && settings.image.automation.mode !== "manual",
  },
  {
    id: "gpu-sharing", name: "One GPU for text and images", area: "images", audience: "setup",
    oneLine: "A local text model and local pictures share one graphics card.",
    what: "Replies wait while a picture renders, and the text model comes back after it.",
    where: settingsAt("#so-gpu-broker", "Images › Image service › GPU sharing"),
    settings: [], doc: "setup/gpu-sharing.md", status: "off-by-default", needs: ["comfyui"],
  },
  {
    id: "story-workflows", name: "Story image workflows", area: "images", audience: "author",
    oneLine: "A story picks which of your ComfyUI workflows draws each kind of picture.",
    what: "Map each picture type to a ComfyUI workflow in Studio. Yours comes back after each story picture; a missing one falls back to yours.",
    where: studioAt("#so-studio-modal", "Story › Illustrations › Workflows"),
    settings: [], guideTopic: "presentation", doc: "setup/images.md", status: "shipped", needs: ["comfyui", "story"],
  },
  {
    id: "model-downloads", name: "Downloading models", area: "images", audience: "setup",
    oneLine: "Download a model from Civitai or Hugging Face into your model folders, verified.",
    what: "Store a token once, check a model, then confirm a card that shows its size, source, license and folder. Nothing downloads on its own.",
    where: settingsAt("#so-model-sources", "Images › Image service › Model sources"),
    settings: [], doc: "setup/images.md", status: "experimental", needs: ["comfyui"],
  },
  {
    id: "sprites", name: "Sprite stage", area: "images", audience: "player",
    oneLine: "Character sprites that change expression as replies stream.",
    what: "The speaking characters stand on a small stage and change expression with the reply. A story can switch the stage on; you can switch it off everywhere.",
    where: settingsAt("#so-sprite-enabled", "Images › Sprite stage"),
    settings: ["sprites"], guideTopic: "presentation", doc: "player/drawer-and-hud.md", status: "off-by-default", needs: ["sprite-pack"],
    isOn: (settings) => settings.sprites.enabled,
  },
  {
    id: "sprite-builder", name: "Build sprite packs", area: "authoring", audience: "author",
    oneLine: "Edit a reference picture into expression sprites and animation frames.",
    what: "Choose a cast member, reference and edit box in Studio. Preview each image before saving into a separate generated set. "
      + "Use an existing expression pack as the reference for changed looks without rebuilding it. Existing artwork is protected.",
    where: studioAt("#so-studio-tab-sprites", "Sprites"), settings: [], doc: "setup/sprites.md", status: "experimental", needs: ["comfyui"],
  },
  {
    id: "sprite-mouth-region", name: "Mouth replacement region", area: "authoring", audience: "author",
    oneLine: "Replace the lips cleanly while leaving the rest of the expression intact.",
    what: "Adjust the green mouth region inside the head box. Keep the old and new lip outlines in its opaque middle, with feathering on the surrounding skin. "
      + "Closed-mouth neutral rest creates a corrected still in a separate set; review it before building speaking frames.",
    where: studioAt("#so-sprite-mouth-region", "Sprites › Mouth replacement region"), settings: [], doc: "setup/sprites.md", status: "experimental", needs: ["comfyui"],
  },
  {
    id: "sprite-edit-resolution", name: "Sprite edit resolution", area: "authoring", audience: "author",
    oneLine: "Compare smaller edits for faster sprite generation.",
    what: "Choose 512, 768 or 1024 pixels for an edit. Smaller edits may be faster; review the face and expression before using them. The saved sprite keeps its original canvas size.",
    where: studioAt("#so-sprite-edit-resolution", "Sprites › Edit resolution"), settings: [], doc: "setup/sprites.md", status: "experimental", needs: ["comfyui"],
  },
  {
    id: "sprite-animation", name: "Animated faces", area: "images", audience: "setup",
    oneLine: "Blink and talking-mouth frames give sprites movement.",
    what: "Packs with animation frames blink and move the speaker’s mouth with the words while replies stream, read from the English text. "
      + "Missing frames keep the static sprite. Reduced motion switches facial animation off.",
    where: settingsAt("#so-sprite-mouth", "Images › Sprite stage › Mouth movement"), settings: [], doc: "setup/sprites.md", status: "experimental", needs: ["sprite-pack"],
  },
];
