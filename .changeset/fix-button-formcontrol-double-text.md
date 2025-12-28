---
'@renoun/screenshot': patch
---

Avoids double-rendered button labels by skipping the form-control renderer for `<button>` elements and letting the normal DOM/text pipeline paint them.
