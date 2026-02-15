import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    watch: {
      ignore: ['**/tmp/**', '**/.cache', '**/.cache/**'],
    },
  },
  server: {
    watch: {
      ignored: ['**/tmp/**', '**/.cache', '**/.cache/**'],
    },
  },
})
