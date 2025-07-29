---
'renoun': minor
---

Only a subset of language grammars for `tsx`, `mdx`, `css`, `html`, `shell`, and `json` are now included by default. The default themes have also been removed. This greatly reduces the overall install size and focuses on renoun's core offering. Additional languages and themes are still supported and now require installing the `tm-grammars` or `tm-themes` packages separately.

For languages with similar grammars, like `js` or `ts` files, these will be mapped to the `tsx` grammar, and `md` mapped to the `mdx` grammar. While these grammars are not exactly the same, it aims to balance install size and good defaults.

### Breaking Changes

If you have configured a language besides `ts(x)`, `md(x)`, `css`, `html`, `shell`, or `json`, you will need to install the `tm-grammars` package. Additionally, if you are using a non-local theme, you will need to install the `tm-themes` package.
