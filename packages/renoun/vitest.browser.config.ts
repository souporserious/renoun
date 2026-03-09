import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import mdx from '@mdx-js/rollup'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  plugins: [mdx()],
  resolve: {
    alias: {
      '#analysis-client-server': fileURLToPath(
        new URL('./src/analysis/client.server.browser.ts', import.meta.url)
      ),
    },
    conditions: ['source'],
  },
  optimizeDeps: {
    include: [
      '@renoun/mdx',
      '@renoun/mdx/rehype',
      '@renoun/mdx/remark',
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
