import { defineConfig } from 'vitest/config'
import mdx from '@mdx-js/rollup'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [mdx()],
  optimizeDeps: {
    include: [
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
    ],
  },
  test: {
    testTimeout: 20_000,
    include: ['src/**/*.browser.{test,spec}.?(c|m)[jt]s?(x)'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
      expect: {
        toMatchScreenshot: {
          comparatorName: 'pixelmatch',
          comparatorOptions: {
            threshold: 0.2,
            allowedMismatchedPixelRatio: 0.01,
          },
        },
      },
    },
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
