# Residency discovery records

Cached outputs do not count as a render/VRAM acceptance repetition.

| Record | Result | Family | Cache | Load s | Render s | Cycle s | tok/s |
|---|---|---|---|---:|---:|---:|---:|
| baseline-fast-mmap-1791133505640.json | refused/failed | fast |  | 10.1 |  |  |  |
| baseline-fast-mmap-1791133573092.json | refused/failed | fast |  | 10.1 |  |  |  |
| baseline-fast-none-1791133455836.json | pass | fast |  | 21.3 |  |  | 30.90 |
| baseline-fast-none-1791133539039.json | pass | fast |  | 7.1 |  |  | 31.91 |
| live-check-1791136936706.json | pass | lifecycle |  |  |  |  |  |
| live-check-1791137649218.json | pass | lifecycle |  |  |  |  |  |
| live-check-1791138064200.json | pass | lifecycle |  |  |  |  |  |
| live-check-1791138118547.json | pass | lifecycle |  |  |  |  |  |
| live-check-1791138231808.json | pass | lifecycle |  |  |  |  |  |
| live-check-1791138300776.json | pass | lifecycle |  |  |  |  |  |
| render-background-auto-1791134715744.json | refused/failed | background |  |  |  |  |  |
| render-hires-auto-1791135017457.json | pass | hires | warm | 24.0 | 48.6 | 86.1 | 32.45 |
| render-hires-auto-1791135108116.json | pass | hires | warm | 24.4 | 46.5 | 84.5 | 32.40 |
| render-hires-auto-1791138975097.json | pass | hires | warm | 23.9 | 48.5 | 85.8 | 32.47 |
| render-hires-auto-1791139065180.json | pass | hires | warm | 23.9 | 46.5 | 83.8 | 32.21 |
| render-portrait-auto-1791134866723.json | pass | portrait | warm | 24.4 | 33.4 | 70.6 | 32.47 |
| render-portrait-auto-1791134925119.json | cached output | portrait | warm | 24.2 | 0.0 | 34.1 | 32.41 |
| render-portrait-auto-1791138831498.json | pass | portrait | warm | 23.8 | 32.4 | 67.9 | 32.61 |
| render-portrait-auto-1791138882961.json | pass | portrait | warm | 22.7 | 11.1 | 45.2 | 32.67 |
| render-scene-auto-1791133777635.json | pass | scene | ram-warm | 24.0 | 38.4 | 75.6 | 31.03 |
| render-scene-auto-1791133929676.json | pass | scene | ram-warm | 24.0 | 29.4 | 67.3 | 30.84 |
| render-scene-auto-1791134189974.json | pass | scene | evict | 22.7 | 37.4 | 73.0 | 33.28 |
| render-scene-auto-1791138706940.json | pass | scene | warm | 23.8 | 38.4 | 74.8 | 32.19 |
| render-scene-auto-1791138757363.json | pass | scene | warm | 22.7 | 10.1 | 44.2 | 32.48 |

- baseline-fast-mmap-1791133505640.json: Loaded profile violates the physical RAM reserve; no generation attempted.
- baseline-fast-mmap-1791133573092.json: Loaded profile violates the physical RAM reserve; no generation attempted.
- render-background-auto-1791134715744.json: {"error":{"message":"Image admission refused: Insufficient physical RAM headroom.","type":"local_residency"}}
