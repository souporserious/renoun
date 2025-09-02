---
'@renoun/mdx': patch
---

Fixes hydration errors caused when rendering headings that include links. These are now unwrapped since the link will be created for the section specifically when rendered.
