---
'renoun': minor
---

Adds the ability to override specific theme values. You can now provide a tuple when configuring themes that specifies the specific theme values to override:

```json
{
  "theme": {
    "light": "vitesse-light",
    "dark": [
      "vitesse-dark",
      {
        "colors": {
          "editor.background": "#000000",
          "panel.border": "#666666"
        }
      }
    ]
  }
}
```

This accepts a subset of a VS Code theme to override, specifically the `colors`, `tokenColors`, and `semanticTokenColors` properties.
