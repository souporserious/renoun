---
'renoun': patch
---

Improves multi-worker performance for repository history and analysis prewarming.

- Coordinates `Repository#getExportHistory()` / `GitFileSystem#getExportHistory()` at the persisted report level so identical requests across workers reuse the same final cached history report instead of reassembling it independently.
- Keeps streamed `History` progress safe under React replay and abandoned generator consumers while preserving cache reuse.
- Fixes `History` shell streaming so Suspense fallbacks render instead of a blank screen while export history is loading, and allows passing `source={repo}` with `sourceOptions` so React can create fresh generators safely on replay.
- Avoids repeated sync remote-ref freshness checks on warm cache-clone metadata probes, caches sync `ls-remote` lookups with a TTL, and skips redundant git-ignore checks for object-backed cache-clone entries.
- Extends renoun CLI prewarm discovery to include `Repository#getExportHistory()` callsites, including `directory.getRepository().getExportHistory()` patterns with the same sparse scope registration used at runtime.
