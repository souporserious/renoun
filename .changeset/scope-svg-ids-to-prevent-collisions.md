---
'renoun': patch
---

Scopes Figma SVG ids during conversion in `Image` component and rewrites `url(#...)`/`#id` references to prevent ID collisions. This fixes cases where clipping, masks, filters, or gradients
from Figma exports spilled outside their containers when multiple SVGs shared
the same ids.
