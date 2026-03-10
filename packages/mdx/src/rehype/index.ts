import type { PluggableList } from 'unified'

import rehypeAddCodeBlock from './add-code-block.js'
import rehypeAddReadingTime from './add-reading-time.js'
import rehypeUnwrapImages from './unwrap-images.js'

export const rehypePlugins: PluggableList = [
  rehypeAddCodeBlock,
  rehypeAddReadingTime,
  rehypeUnwrapImages,
]
