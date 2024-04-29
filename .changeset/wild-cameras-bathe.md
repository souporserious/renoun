---
'mdxts': minor
---

Fixes data source ordering to use strings instead of `parseInt` to ensure that the items are always ordered correctly.

### Breaking Changes

The `order` property for a data source item is now a padded string instead of a number.
