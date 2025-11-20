import type { ConfigurationOptions } from './types'

/**
 * The default configuration options.
 * @internal
 */
export const defaultConfig: ConfigurationOptions = {
  editor: 'vscode',
  images: {
    outputDirectory: 'public/images',
  },
  languages: [
    'css',
    'js',
    'jsx',
    'ts',
    'tsx',
    'md',
    'mdx',
    'shell',
    'json',
    'html',
  ],
  sources: {},
}
