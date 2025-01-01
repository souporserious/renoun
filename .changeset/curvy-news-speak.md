---
'renoun': minor
---

Now `Directory#getParent` throws when called for the root directory. This makes the method easier to work with and aligns better with `File#getParent` always returning a `Directory` instance.
