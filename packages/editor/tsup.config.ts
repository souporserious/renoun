import { defineConfig } from 'tsup'

const hoistUseClientPlugin = {
  name: 'hoist-use-client',
  setup(build) {
    build.onEnd((result) => {
      result.outputFiles
        ?.filter((file) => !file.path.endsWith('.map'))
        .forEach((file) => {
          Object.defineProperty(file, 'text', {
            value: file.text.includes('"use client";')
              ? `"use client";\n${file.text.replaceAll('"use client";', '')}`
              : file.text,
          })
        })
    })
  },
}

export default defineConfig({
  esbuildPlugins: [hoistUseClientPlugin],
})
