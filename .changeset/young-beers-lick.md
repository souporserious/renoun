---
'renoun': major
---

Removes `getDefaultExport` and `getNamedExport` from collection export sources in favor of a new `getExport` method. This method works exactly the same as the previous `getNamedExport` method with the addition of accepting `default` as an export. This simplifies the API and reduces the number of methods needed to query an export source.

### Breaking Changes

Update any usage of `getDefaultExport` and `getNamedExport` to use the new `getExport` method:

- `getDefaultExport()` -> `getExport('default')`
- `getNamedExport('metadata')` -> `getExport('metadata')`
