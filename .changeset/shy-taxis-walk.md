---
'renoun': minor
---

Replaces `getHeadings` method with `getSections` for `MarkdownFile`, `MDXFile`, and `JavaScriptFile` to build outlines from regions and exports. This now includes richer metadata instead of only headings.

### Breaking Changes

The `getHeadings` method for `MarkdownFile`, `MDXFile`, and `JavaScriptFile` has been renamed to `getSections`. The shape is slightly different now that it produces a nested list of section metadata.
