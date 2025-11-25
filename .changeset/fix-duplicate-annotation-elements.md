---
'renoun': patch
---

Fixes annotation processing re-running at the same character boundary causing `CodeBlock`/`Tokens` to wrap the same segment twice when ranges align with token edges.
