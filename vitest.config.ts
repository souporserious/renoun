import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
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
