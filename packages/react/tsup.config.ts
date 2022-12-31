import { defineConfig } from 'tsup'

const prependUseClientPlugin = {
  name: 'prepend-use-client',
  setup(build) {
    build.onEnd((result) => {
      // result.outputFiles
      //   ?.filter((file) => !file.path.endsWith('.map'))
      //   .forEach(async (file) => {
      //     Object.defineProperty(file, 'text', {
      //       value: `"use client"\n${file.text}`,
      //     })
      //   })
    })
  },
}

export default defineConfig({
  esbuildPlugins: [prependUseClientPlugin],
})
