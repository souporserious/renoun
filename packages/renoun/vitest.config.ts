import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  plugins: [mdx()],
  resolve: {
    alias: {
      '#analysis-client-server': fileURLToPath(
        new URL('./src/analysis/client.server.ts', import.meta.url)
      ),
    },
    conditions: ['source'],
  },
  test: {
    testTimeout: 15_000,
    include: [
      'src/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'scripts/**/*.{test,spec}.?(c|m)[jt]s?(x)',
    ],
    exclude: [
      'src/**/*.browser.test.?(c|m)[jt]s?(x)',
      'src/**/*.browser.spec.?(c|m)[jt]s?(x)',
    ],
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
