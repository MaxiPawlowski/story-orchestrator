# Pose workflow templates

Plan 29 bundle fragment: `story-workflows.json`; choose P2 for portrait or map P3 instead. Both graphs contain `%prompt%` and ST `%char_avatar%` / `%seed%` placeholders. Replace installed model names, the cutout node/model if needed and P2's skeleton input with an author-uploaded retargeted map before installing the workflow. Hashes cover canonical pretty JSON without its trailing newline; edit the graph and recompute its hash on import/export.

P2 prompt: same character as image 1, take the pose in image 2, preserve identity, outfit and style, whole character. P3 prompt: same character from the two reference inputs, follow the named pose text, preserve identity, outfit and style. P3 uses the same character reference twice and no skeleton. Runtime P3 also duplicates image 1 when the encoder accepts a second reference; it omits image 2 on a one-image encoder. These JSON templates were not run. S0 owns node compatibility, quality and timing.

S0 pilot 2026-10-11 ran the runtime `editGraph` shape of these two graphs on the 3090 (not these files as loaded templates); results are in plan 33 Gate record "S0 pilot and DWPose download".
