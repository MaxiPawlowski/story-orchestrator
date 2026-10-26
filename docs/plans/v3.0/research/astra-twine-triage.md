**SPIKE-LATER [inferred].** Defer plan 16’s bidirectional converter. Reopen for a concrete Twine workflow the owner wants; start with export only. The [replan](/C:/dev/so-dev/docs/plans/v3.0/00-overview.md:42) prioritizes text performance, output quality, and images. This adds authoring convenience without directly advancing those priorities.

1. **Fit**

**[from-spec]** Twee 3 specifies passage headers, tags, metadata, and bodies—not a common language for variables, conditions, or effects. Those belong to story formats. Current Twine supports native Twee import, including position metadata; older Cookbook guidance saying otherwise is outdated. [Twee specification](https://github.com/iftechfoundation/twine-specs/blob/master/twee-3-specification.md), [Twine import reference](https://twinery.org/reference/en/story-library/creating.html).

**[verified-in-code → inferred mapping]** The [schema](/C:/dev/so-dev/src/engine/schema.ts) supports these correspondences:

| Twee element | Story equivalent and limitation |
|---|---|
| Passage | Checkpoint identity maps well. Displayed prose does not equal an objective, private guidance, or scripted reply. |
| Static link | Candidate transition. It supplies neither a typed gate nor priority or boundary timing. |
| Tags | Possible chapter/type conventions; checkpoints have no general tag field. Reserved tags require special handling. |
| Variables | Primitive values partly fit qualities; types, source, rubric, evidence rules, latching, and monotonicity still need authoring. |
| Macros | No general mapping to gates, roster, effects, lorebooks, agency, or illustration workflows. |

**[verified-in-code]** Transitions select the first satisfied gate after priority/declaration ordering. `state_snapshot` describes expected state, not assignment. Importing links through [newTransition](/C:/dev/so-dev/src/studio/mutations.ts:76) would create `{all: []}`, which evaluates true: choices could become automatic progression.

**[from-spec → inferred]** Import loses rendered interaction, variable scope, collections, computed destinations, setters, scripts, and format-specific history behavior. Export loses orchestration semantics unless represented as annotations or custom data. Twine *can* implement characters and game systems; it simply lacks this extension’s standardized equivalents. [SugarCube documentation](https://www.motoslave.net/sugarcube/2/docs/#markup-link), [Harlowe manual](https://twine2.neocities.org/).

**[inferred]** A useful lossless **structural** round trip is possible for a declared subset: unique passage identities, start node, static adjacency, and explicitly preserved labels/tags. Behavioral round-tripping is not automatic. Embedding canonical Story JSON could preserve authored data, but creates a custom transport with synchronization rules—not general Twine compatibility. Native JSON export already exists.

2. **Owner value**

**[verified-in-code]** [StudioGraph](/C:/dev/so-dev/src/studio/components/StudioGraph.tsx) already provides graph editing and Mermaid export. [Wizard tools](/C:/dev/so-dev/src/copilot/agent/tools.ts) map to typed mutations; its [loop](/C:/dev/so-dev/src/copilot/agent/loop.ts) validates calls, returns diagnostics, and supports review or automatic drafting.

**[inferred]**

- **Import: later, demand-driven.** Valuable for reusing an actual Twine outline or preferred external authoring workflow. Without that source material, it adds another incomplete-draft repair path.
- **Export/visualizer: smallest plausible later slice.** Enables Twine’s map and external structural review. Incremental benefit is modest beside Studio and Mermaid.
- **Wizard-drafts-Twee: drop as proposed.** Familiar syntax might reduce drafting tokens, but adds translation and repair while omitting the difficult story semantics. If tool-call overhead is measured as a problem, evaluate a typed batch operation first. Any quality claim needs real-model comparison.

3. **Risks and costs**

**[from-spec → inferred]** Harlowe and SugarCube are a maintenance trap: conditional hooks, dynamic destinations, setter timing, collections, and custom macros require separate semantic support. A regex link extractor can invent edges from comments or literals and miss computed ones. Never execute imported scripts to discover structure.

**[verified-in-code → inferred]** [Validation](/C:/dev/so-dev/src/engine/validate.ts) checks references, gate types, unique identities, starts, and intermediate-to-anchor reachability. Conversion must additionally handle escaping, reserved passages, malformed metadata, duplicate links, cycles, terminal passages, and unsupported syntax without silently inventing gates.

**[verified-in-code]** [JSON export](/C:/dev/so-dev/src/studio/io.ts:4) serializes the draft without redaction. Authored secret labels and secret milestones exist.

**[inferred]** Separate export purposes. A private authoring archive should preserve authored secrets; stripping them breaks fidelity. A shareable view should allowlist fields and exclude hidden content, private guidance, lore, and runtime memories/held secrets. Names and future topology can themselves spoil the campaign: even an anonymized graph is author-only, not automatically safe for the owner’s fresh play. Never include credentials. Use synthetic/public fixtures.

**[inferred]** Keep conversion lazy and host-independent; no bundled Twine runtime. The 1,300,000-byte main-bundle ceiling remains unchanged.

4. **Smallest slice and acceptance**

**[inferred; proposed floors]** Later, build a local author-only graph exporter: one passage per checkpoint, static links, explicit start, deterministic positions, and an omission notice. No prose, macros, importer, or wizard changes.

Require:

- Exact node/start/adjacency agreement on synthetic fixtures, including cycles and self-links; disclose parallel-edge collapse.
- Byte-stable output; collision-safe names and escaping.
- Zero planted sensitive strings exported; zero script execution.
- Deterministic Twine import/map check on a pinned version.
- No converter modules in the initial bundle; existing budget and required gates pass.

**[inferred estimate]** 2–4 engineer-days including integration, fixtures, documentation, and gates; no GPU. Reopen only for demonstrated value beyond Mermaid.

Read-only review completed; no files modified or tests run.