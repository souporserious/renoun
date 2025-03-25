import type { Root } from 'hast'
import type { VFile } from 'vfile'
import { valueToEstree } from 'estree-util-value-to-estree'
import { define } from 'unist-util-mdx-define'
import rehypeInferReadingTimeMeta from 'rehype-infer-reading-time-meta'

/**
 * Estimated reading time in minutes.
 *
 * The result is not rounded so it’s possible to retrieve estimated seconds from it.
 */
export type MDXReadingTime = number

/** Exports the reading time as a variable. */
export default function addReadingTime({
  age = [18, 20],
}: {
  /**
   * The age or range of ages representing when your target audience typically finishes school.
   *
   * This parameter adjusts the reading time estimation based on the educational level of your readers.
   * Provide a single number (e.g. `18` for high school graduates or `21` for college graduates)
   * to indicate a specific graduation age.
   *
   * Alternatively, supply an array with lower and upper ages. For example, `[18, 21]` would
   * cover both high school and college graduates.
   *
   * Setting to `null` will fall back to the default reading time assumptions.
   */
  age?: [number, number] | [number] | number | null
} = {}) {
  const inferReadingTimeMeta = rehypeInferReadingTimeMeta({ age })

  return (tree: Root, file: VFile) => {
    inferReadingTimeMeta(tree, file)

    const readingTime = file.data.meta?.readingTime

    if (!readingTime) {
      return
    }

    define(tree, file, {
      readingTime: valueToEstree(readingTime),
    })
  }
}
