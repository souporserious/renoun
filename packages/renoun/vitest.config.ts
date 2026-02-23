import { defineConfig } from 'vitest/config'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  plugins: [mdx()],
  test: {
    testTimeout: 15_000,
    watch: {
      ignore: [
        '**/tmp/**',
        '**/.tmp/**',
        '**/.tmp-*',
        '**/.cache',
        '**/.cache/**',
      ],
    },
  },
  server: {
    watch: {
      ignored: [
        '**/tmp/**',
        '**/.tmp/**',
        '**/.tmp-*',
        '**/.cache',
        '**/.cache/**',
      ],
    },
  },
})
