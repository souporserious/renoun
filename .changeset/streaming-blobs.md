---
'renoun': minor
---

Improves `File` web compatibility by now exposing `type` and `size` getters, as well as `slice`, `stream`, `text`, and `arrayBuffer` methods which enforce byte ranges when lengths are known and falls back to file system streams when not.
