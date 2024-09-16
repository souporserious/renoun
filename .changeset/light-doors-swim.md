---
'renoun': minor
---

Moves `renoun` package to ESM only. To upgrade in Next.js projects, modify the `next.config.js` file to include the following in the webpack `extensionAlias` configuration:

```js
export default {
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    }

    // ...

    return config
  },
}
```
