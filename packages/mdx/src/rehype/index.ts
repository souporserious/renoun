import type { PluggableList } from 'unified'
import rehypeUnwrapImages from 'rehype-unwrap-images'

import rehypeAddCodeBlock from './add-code-block.js'
import rehypeAddReadingTime from './add-reading-time.js'

export const rehypePlugins: PluggableList = [
  rehypeAddCodeBlock,
  rehypeAddReadingTime,
  rehypeUnwrapImages,
]
