---
'@renoun/screenshot': patch
---

Fixes WebGL and canvas capture by snapshotting canvas content at screenshot start before async resource preparation runs. Falls back to a visible placeholder with a clear warning when browser security restrictions prevent cross-origin or tainted canvas pixels from being copied.
