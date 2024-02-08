import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/index.ts'],
  target: 'esnext',
  external: ['webpack'],
  format: ['cjs'],
  outDir: 'dist/cjs',
})
