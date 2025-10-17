import type { ConfigurationOptions } from './types'

/**
 * The default configuration options.
 * @internal
 */
export const defaultConfig: ConfigurationOptions = {
  editor: 'vscode',
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
}
