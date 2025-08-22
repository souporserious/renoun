---
'renoun': patch
---

Improves `getLocalGitFileMetadata` security by preventing injection from the provided `filePath` by switching to `execFile` and passing explicit arguments when parsing git history.
