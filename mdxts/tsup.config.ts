import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'index.ts',
    'components/index.ts',
    'components/server/index.ts',
    'components/client/index.ts',
    'next/index.ts',
    'rehype/index.ts',
    'remark/index.ts',
    'transform/index.ts',
    'utils/index.ts',
    'watcher/index.ts',
  ],
  target: 'es2018',
  external: ['react'],
  dts: true,
  format: ['esm', 'cjs'],
})
