---
'renoun': minor
---

Moves type reference resolution to the `renoun` cli process. This offers a few benefits:

- Faster page loads in development where the `APIReference` component is used since it now utilizes a `Suspense` boundary
- Cross-references between types are now supported which will allow linking type references across pages
