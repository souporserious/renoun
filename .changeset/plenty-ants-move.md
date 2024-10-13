---
'renoun': minor
---

Adds the ability to specify the set of languages loaded for syntax highlighting using the `languages` field in the `renoun.json` configuration file. This allows you to reduce the bundle size by only loading the languages you need:

```json
{
  "languages": ["sh", "ts", "tsx"]
}
```
