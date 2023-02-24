import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import { transformSymbolicLinks } from './index'

const fixture = `Examples can be rendered in MDX using the helper [[Example]] and [[Preview]] components. These component take a \`source\` prop, which is the name of the example file or code block in any of the [locations examples can exist](./01.writing.mdx).`

test('transforms symbolic links correctly', async () => {
  const processor = unified()
    .use(rehypeParse)
    .use(() => transformSymbolicLinks)
    .use(rehypeStringify)
  const outputHtml = await processor.process(fixture)

  expect(outputHtml).toMatchSnapshot()
})
