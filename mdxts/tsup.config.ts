import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/index.ts'],
  target: 'es2018',
  external: ['react'],
  format: ['cjs'],
  outDir: 'dist/cjs',
})
