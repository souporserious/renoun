import { defineConfig } from 'vitest/config'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  plugins: [mdx()],
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
