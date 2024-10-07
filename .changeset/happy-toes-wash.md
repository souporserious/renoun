---
'renoun': patch
---

This update resolves several issues with API references, particularly recursion bugs in the internal `resolveType` utility. The key changes involve an updated algorithm for computing component types, which affects the following case:

- Named functions with a capitalized first letter and a single non-object argument are now interpreted as components when they should be functions. This is an unintended behavior change and will be corrected in an upcoming update.

### Type References

Type references are now split into two maps that serve the following use cases:

- **Prevent Infinite Recursion**: A map of type references is maintained during type iteration of the root type to prevent infinite recursion.
- **Optimized Type Handling for Exported Declarations**:
  - Adds an explicit map for tracking exported declarations to avoid type duplication.
  - Improves performance and establishes a link between types.
