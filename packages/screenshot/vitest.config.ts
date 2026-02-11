import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
        },
      }),
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
  },
})
