import { defineConfig } from 'vitest/config'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  plugins: [mdx()],
  test: {
    // The renoun suite mixes TypeScript analysis, git integration, sqlite
    // persistence, and framework startup tests, with some process-wide caches
    // and runtime state. Running files in parallel causes contention and
    // cross-file interference that shows up as false timeouts and cache misses.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
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
        '**/.renoun',
        '**/.renoun/**',
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
        '**/.renoun',
        '**/.renoun/**',
        '**/.cache',
        '**/.cache/**',
      ],
    },
  },
})
