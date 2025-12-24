---
'@renoun/screenshot': patch
---

Fixes unwanted borders appearing around button elements in screenshots. The `renderFormControl` function now respects `border: none` on buttons instead of forcing a minimum 1px border. Also improves `drawOutline` to skip rendering for `outline-style: auto`, which is the browser default for focus rings.
