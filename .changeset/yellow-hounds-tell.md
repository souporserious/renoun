---
'mdxts': patch
---

Fix pathname generation in case the `baseDirectory` exists multiple times in the `filePath`.

Previously having a file path like `content/content_1/path/file.mdx` and using `content` as base directory results in an invalid pathname like `content-1path/file`.

Now we get the correct path name like `/content-1/path/file`.
