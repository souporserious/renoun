---
'renoun': patch
---

Fixes app command failing when the project's `node_modules` directory contains nested `node_modules` directories. The `OverrideManager` was attempting to hard link files inside `node_modules`, which causing errors.
