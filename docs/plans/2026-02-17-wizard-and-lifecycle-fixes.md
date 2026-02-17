# Wizard Expansion + Chat Lifecycle Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three broken chat-lifecycle behaviours (roadmap not per-chat, signature invalidation after expansion, story not bound to chat at generation time) and expand the story generator wizard with a proper story-type questionnaire as its first step.

**Architecture:** Roadmap moves from `StoredStoryRecord.meta` into `PersistedChatState` (keyed by chatId). Signature computation skips stub checkpoints so expansions don't reset progress. After wizard generation, the story key is immediately persisted for the active chatId. The wizard gains a new "questionnaire" step before premise entry — genre, tone, length, protagonist type — whose answers enrich the premise sent to the LLM.

**Tech Stack:** React, Zustand vanilla store, SillyTavern extension settings (via `getExtensionSettingsRoot` + `saveSettingsDebounced`), existing `generateRaw` / `StoryGeneratorService` pipeline.

---

## Bug 1 — Roadmap must live per-chat, not per-story

### Task 1: Add `roadmap` to `PersistedChatState`

**Files:**
- Modify: `src/utils/story-state.ts`

**Step 1: Add field to types**

In `PersistedChatState` interface add:
```typescript
roadmap?: string;
```

In `RuntimeStoryState` interface add:
```typescript
roadmap?: string;
```

In `LoadedStoryState` add:
```typescript
roadmap?: string;
```

**Step 2: Forward roadmap through `loadStoryState`**

In `loadStoryState`, when returning stored state change the return to:
```typescript
return {
  state: sanitized,
  source: "stored",
  storyKey: storedKey,
  roadmap: migrated.roadmap ?? undefined,
};
```
And for default returns add `roadmap: undefined`.

**Step 3: Write roadmap in `persistStoryState`**

Add `roadmap?: string` parameter to the function signature object. In the `map[key] = { ... }` block add:
```typescript
roadmap: roadmap ?? map[key]?.roadmap,
```

**Step 4: Run tests**
```bash
cd "F:\dev\SillyTavern-MainBranch\public\scripts\extensions\third-party\story-orchestrator"
npx jest --no-coverage 2>&1 | tail -15
```
Expected: same pass/fail count as before (1 pre-existing fail in turnController).

**Step 5: Commit**
```bash
git add src/utils/story-state.ts
git commit -m "feat: add roadmap to per-chat persisted state"
```

---

### Task 2: Thread roadmap through orchestrator hydration

**Files:**
- Modify: `src/controllers/persistenceController.ts`
- Modify: `src/store/storySessionStore.ts`

**Step 1: Add `roadmap` to `StorySessionValueState`**

In `storySessionStore.ts`, find `StorySessionValueState` and add:
```typescript
roadmap: string | null;
```
Add `setRoadmap: (roadmap: string | null) => void` to `StorySessionActions`.

In `createStore` initializer set `roadmap: null`.

In the actions object add:
```typescript
setRoadmap: (roadmap) => set({ roadmap }),
```

**Step 2: Expose roadmap from `hydrate()` in persistenceController**

After `loadStoryState` resolves in `hydrate()`, call:
```typescript
storySessionStore.getState().setRoadmap(loaded.roadmap ?? null);
```

**Step 3: Run tests**
```bash
npx jest --no-coverage 2>&1 | tail -15
```

**Step 4: Commit**
```bash
git add src/store/storySessionStore.ts src/controllers/persistenceController.ts
git commit -m "feat: thread roadmap through hydration into session store"
```

---

### Task 3: Use per-chat roadmap in `expandStub` and save it back

**Files:**
- Modify: `src/services/StoryOrchestrator.ts`
- Modify: `src/components/context/StoryContext.tsx`

**Step 1: Read roadmap from store in `buildExpansionInput` (inside `expandStub`)**

In `StoryOrchestrator.ts`, where `expandCheckpoint` is called, read roadmap:
```typescript
const roadmap = storySessionStore.getState().roadmap ?? "";
```
Pass it as `roadmap` in the `ExpansionInput` object.

**Step 2: Save updated roadmap to per-chat state in `mergeExpansionRef`**

In `StoryContext.tsx`, after `await persistStory(...)`, also call:
```typescript
const { chatId, groupChatSelected } = storySessionStore.getState();
if (chatId && groupChatSelected) {
  const currentRuntime = storySessionStore.getState().runtime; // or read from store
  persistStoryState({ chatId, story: storyRaw as NormalizedStory, state: currentRuntime, roadmap: result.roadmap });
}
storySessionStore.getState().setRoadmap(result.roadmap);
```

**Step 3: Remove `meta.roadmap` from the `persistStory` call in `mergeExpansionRef`**

Change:
```typescript
await persistStory(storyRaw, { targetKey: currentKey ?? undefined, meta: { roadmap: result.roadmap } });
```
To:
```typescript
await persistStory(storyRaw, { targetKey: currentKey ?? undefined });
```

**Step 4: Run tests**
```bash
npx jest --no-coverage 2>&1 | tail -15
```

**Step 5: Commit**
```bash
git add src/services/StoryOrchestrator.ts src/components/context/StoryContext.tsx
git commit -m "fix: roadmap now stored per-chat, not in story library record"
```

---

## Bug 2 — Signature invalidation after expansion

### Task 4: Exclude stub checkpoints from story signature

**Files:**
- Modify: `src/utils/story-state.ts`

**Step 1: Filter stubs in `computeStorySignature`**

`computeStorySignature` currently hashes all checkpoints and transitions. After an expansion, new non-stub checkpoints and transitions are added, breaking the hash.

Change the `cpSig` computation to exclude stub checkpoints:
```typescript
const cpSig = story.checkpoints
  .filter(cp => !(cp as { _isStub?: boolean })._isStub)
  .map(cp => `${String(cp.id)}::${cp.name ?? ""}::${cp.objective ?? ""}`)
  .join("||");
```

Also filter transitions whose `to` is a stub:
```typescript
const stubIds = new Set(
  story.checkpoints
    .filter(cp => (cp as { _isStub?: boolean })._isStub)
    .map(cp => cp.id)
);
const edgeSig = (story.transitions ?? [])
  .filter(t => !stubIds.has(t.to))
  .map(edge => { ... })
  .join("||");
```

**Step 2: Re-persist state with new signature after merge**

In `mergeExpansionRef` (StoryContext.tsx), after saving the updated story and roadmap, also call `persistStoryState` again with the updated story so the stored signature matches the newly-saved story. (This may duplicate the call from Task 3 Step 2 — consolidate into one call.)

**Step 3: Run tests**
```bash
npx jest --no-coverage 2>&1 | tail -15
```

**Step 4: Commit**
```bash
git add src/utils/story-state.ts
git commit -m "fix: exclude stubs from story signature to prevent progress reset after expansion"
```

---

## Bug 3 — Story not bound to chat at generation time

### Task 5: Persist story-to-chat link immediately after wizard generation

**Files:**
- Modify: `src/components/studio/StoryGeneratorWizard/index.tsx`
- Modify: `src/components/settings/index.tsx`

**Step 1: Pass `activeChatId` and `groupChatSelected` into wizard**

In `settings/index.tsx`, import `activeChatId` and `groupChatSelected` from `useStoryContext()`:
```typescript
const { ..., activeChatId, groupChatSelected, saveLibraryStory, ... } = useStoryContext();
```

Add them as props to `StoryGeneratorWizardModal`:
```tsx
<StoryGeneratorWizardModal
  ...
  activeChatId={activeChatId}
  groupChatSelected={groupChatSelected}
/>
```

**Step 2: Accept props in wizard and persist selection after save**

Add to `WizardProps`:
```typescript
activeChatId: string | null;
groupChatSelected: boolean;
```

In `handleGenerate`, after `onSelectKey(result.key)` succeeds, add:
```typescript
if (activeChatId && groupChatSelected) {
  try {
    const defaultRuntime = makeDefaultState(story as NormalizedStory);
    persistStoryState({
      chatId: activeChatId,
      story: story as NormalizedStory,
      state: defaultRuntime,
      storyKey: result.key,
      roadmap: "",
    });
  } catch (err) {
    console.warn("[Wizard] Failed to persist story selection for chat", err);
  }
}
```

Import `makeDefaultState`, `persistStoryState` from `@utils/story-state` and `NormalizedStory` from `@utils/story-validator`.

**Step 3: Run tests**
```bash
npx jest --no-coverage 2>&1 | tail -15
```

**Step 4: Commit**
```bash
git add src/components/studio/StoryGeneratorWizard/index.tsx src/components/settings/index.tsx
git commit -m "fix: persist story-to-chat binding immediately on wizard generation"
```

---

## Feature — Wizard questionnaire step

### Task 6: Add questionnaire step to `StoryGeneratorWizard`

The wizard currently goes: **premise → roles → generating → done**.

New flow: **questionnaire → premise → roles → generating → done**.

The questionnaire collects:
- **Genre** (Fantasy / Sci-Fi / Horror / Mystery / Romance / Other)
- **Tone** (Dark & Gritty / Lighthearted / Suspenseful / Romantic / Other)
- **Length** (Short — 5 beats / Medium — 10 beats / Epic — 20+ beats)
- **Protagonist type** (Player-driven / NPC-driven / Ensemble)

These answers are appended to the premise context sent to the LLM in `generateSeed`.

**Files:**
- Modify: `src/components/studio/StoryGeneratorWizard/index.tsx`
- Modify: `src/services/StoryGeneratorService.ts`

**Step 1: Add questionnaire state to wizard**

Add type:
```typescript
type WizardStep = "questionnaire" | "premise" | "roles" | "generating" | "done" | "error";

interface StoryQuestionnaire {
  genre: string;
  tone: string;
  length: string;
  protagonist: string;
}
```

Add state:
```typescript
const [questionnaire, setQuestionnaire] = useState<StoryQuestionnaire>({
  genre: "",
  tone: "",
  length: "Medium — 10 beats",
  protagonist: "Player-driven",
});
const [step, setStep] = useState<WizardStep>("questionnaire");
```

**Step 2: Render questionnaire UI**

Add a `step === "questionnaire"` block before the premise step. Use `<select>` dropdowns with ST class `text_pole`. Example structure:

```tsx
{step === "questionnaire" && (
  <div className="flex flex-col gap-3">
    <p className="text-sm opacity-70">Tell us about the story you want to create.</p>

    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Genre</label>
      <select className="text_pole" value={questionnaire.genre} onChange={e => setQuestionnaire(q => ({ ...q, genre: e.target.value }))}>
        <option value="">Select genre…</option>
        {["Fantasy", "Sci-Fi", "Horror", "Mystery", "Romance", "Thriller", "Slice of Life", "Other"].map(g => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>
    </div>

    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Tone</label>
      <select className="text_pole" value={questionnaire.tone} onChange={e => setQuestionnaire(q => ({ ...q, tone: e.target.value }))}>
        <option value="">Select tone…</option>
        {["Dark & Gritty", "Lighthearted & Fun", "Suspenseful", "Romantic", "Comedic", "Dramatic", "Other"].map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>

    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Story Length</label>
      <select className="text_pole" value={questionnaire.length} onChange={e => setQuestionnaire(q => ({ ...q, length: e.target.value }))}>
        {["Short — 5 beats", "Medium — 10 beats", "Long — 15 beats", "Epic — 20+ beats"].map(l => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
    </div>

    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Story Focus</label>
      <select className="text_pole" value={questionnaire.protagonist} onChange={e => setQuestionnaire(q => ({ ...q, protagonist: e.target.value }))}>
        {["Player-driven", "NPC-driven", "Ensemble cast", "Mystery/Investigation"].map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </div>

    <div className="flex justify-end gap-2">
      <button type="button" className="menu_button px-3 py-1" onClick={onClose}>Cancel</button>
      <button
        type="button"
        className="menu_button px-3 py-1"
        disabled={!questionnaire.genre || !questionnaire.tone}
        onClick={() => setStep("premise")}
      >
        Next →
      </button>
    </div>
  </div>
)}
```

**Step 3: Update "← Back" in premise step to go to questionnaire**

Change `onClick={() => setStep("premise")}` in the roles step back button — already goes to premise. Change premise step back button:
```tsx
<button type="button" className="menu_button px-3 py1" onClick={() => setStep("questionnaire")}>← Back</button>
```

**Step 4: Pass questionnaire into `SeedInput`**

Add `questionnaire?: StoryQuestionnaire` to `SeedInput` in `StoryGeneratorService.ts`:
```typescript
export interface SeedInput {
  ...
  questionnaire?: {
    genre: string;
    tone: string;
    length: string;
    protagonist: string;
  };
}
```

**Step 5: Enrich the roadmap prompt with questionnaire answers**

In `generateSeed()`, where the roadmap prompt is built, append:
```typescript
const questionnaireContext = input.questionnaire
  ? `\nSTORY PARAMETERS:\n- Genre: ${input.questionnaire.genre}\n- Tone: ${input.questionnaire.tone}\n- Length: ${input.questionnaire.length}\n- Focus: ${input.questionnaire.protagonist}`
  : "";
```
Append `questionnaireContext` to the roadmap prompt string.

**Step 6: Pass questionnaire from wizard to `generateSeed` call**

In `handleGenerate` in the wizard, add `questionnaire` to the `generateSeed` call:
```typescript
const seedResult: SeedResult = await service.generateSeed({
  premise: premise.trim(),
  characters,
  worldInfo,
  storyTitle: title,
  globalLorebook: globalLorebook ?? "Story World",
  questionnaire,
});
```

**Step 7: Store questionnaire answers in `meta` for reference**

In the `onSaveStory` call, add questionnaire fields to meta:
```typescript
meta: {
  premise: premise.trim(),
  roadmap: "",
  generatedAt: Date.now(),
  isDynamic: true,
  genre: questionnaire.genre,
  tone: questionnaire.tone,
},
```

Update `StoredStoryMeta` in `story-library.ts` to add:
```typescript
genre?: string;
tone?: string;
```

**Step 8: Run tests and typecheck**
```bash
npx jest --no-coverage 2>&1 | tail -15
npx tsc --noEmit 2>&1
npx eslint src/components/studio/StoryGeneratorWizard/index.tsx src/services/StoryGeneratorService.ts 2>&1
```
Expected: all clean.

**Step 9: Commit**
```bash
git add src/components/studio/StoryGeneratorWizard/index.tsx src/services/StoryGeneratorService.ts src/utils/story-library.ts
git commit -m "feat: add questionnaire step to story generator wizard"
```

---

## Task 7: Final build + lint verification

**Step 1: Full lint pass**
```bash
npx eslint src/ 2>&1 | grep -v "node_modules"
```
Fix any new errors introduced.

**Step 2: Build**
```bash
npm run build 2>&1 | tail -10
```
Expected: webpack compiles, only the pre-existing `storybookMocks.ts` TS error, exit code 0.

**Step 3: Final commit if any lint fixes**
```bash
git add -p
git commit -m "fix: lint cleanup after wizard and lifecycle fixes"
```

---

## Unresolved questions

None — scope is clear from bug analysis.
