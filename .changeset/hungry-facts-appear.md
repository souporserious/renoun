---
'renoun': patch
---

Fixes `JavaScriptFile#getType` union member references that point to external unions from resolving to their intrinsic type. References are now preserved correctly for all union members even when the member itself a union. An example of where this was previously broken could be seen in the `CodeBlock` `language` prop that used an external `Languages` type. This would previously resolve to flat union members `jsx | tsx | mdx` instead of `Languages | 'mdx'`. This is now fixed and the type will resolve to `Languages | 'mdx'` as expected.
