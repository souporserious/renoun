import { defineConfig } from 'vitest/config'
import mdx from '@mdx-js/rollup'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [mdx()],
  test: {
    testTimeout: 20_000,
    include: ['src/**/*.browser.{test,spec}.?(c|m)[jt]s?(x)'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
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
