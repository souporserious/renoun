import type { PluggableList } from 'unified'

import rehypeAddCodeBlock from './add-code-block.ts'
import rehypeAddReadingTime from './add-reading-time.ts'
import rehypeUnwrapImages from './unwrap-images.ts'

export const rehypePlugins: PluggableList = [
  rehypeAddCodeBlock,
  rehypeAddReadingTime,
  rehypeUnwrapImages,
]
