---
'renoun': minor
---

Replaces [shiki](https://github.com/shikijs/shiki) with an internal `createTokenizer` utility that uses [oniguruma-to-es](https://github.com/slevithan/oniguruma-to-es) and [vscode-textmate](https://github.com/shikijs/vscode-textmate) directly. This implementation is based on both [textmate-highlighter](https://github.com/fabiospampinato/textmate-highlighter) and `shiki` to provide a smaller, focused highlighter that allows for more granular control.
