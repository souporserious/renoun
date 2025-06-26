---
'renoun': patch
---

Adds both runtime and type-level safety to prevent using the `recursive` option with single-level `include` filters (`*.mdx`) in the `Directory#getEntries` method, while still allowing it with multi-level patterns (`**/*.mdx`). This ensures that `include` filters targeting a single directory level cannot be used recursively, which could lead to unexpected behavior.
