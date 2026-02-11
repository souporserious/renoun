---
'@renoun/screenshot': patch
---

Fixes 3D transform rendering by hardening the WebGL perspective path initialization so rendering state is not reset before draw.
