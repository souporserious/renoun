import { defineConfig } from 'vitest/config'
import mdx from '@mdx-js/rollup'

export default defineConfig({
  plugins: [mdx()],
})
