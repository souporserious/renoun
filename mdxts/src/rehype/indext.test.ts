import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { Project } from 'ts-morph'
import { rehypePlugin } from './index'

const remarkProcessor = unified()
  // @ts-expect-error
  .use(remarkParse)
  // @ts-expect-error
  .use(remarkRehype)

test('adds code blocks to project', async () => {
  const project = new Project()
  const processor = remarkProcessor
    .use(rehypePlugin, {
      onJavaScriptCodeBlock: (_filePath, _lineStart, filename, codeString) => {
        project.createSourceFile(filename, codeString, { overwrite: true })
      },
    })
    .use(rehypeStringify)
  const outputHtml = await processor.process(
    `# Hello

\`\`\`tsx
const foo = 'bar'
\`\`\`

\`\`\`tsx
const bar = 'baz'
\`\`\`
`
  )

  console.log(project.getSourceFiles().map((file) => file.getText()))
})
// expect(outputHtml).toMatchSnapshot()
// expect(project.getSourceFiles().length).toBe(2)
// expect(project.getSourceFiles()[0].getText()).toBe(`const foo = 'bar'`)

// const symbolicLinksFixture = `Examples can be rendered in MDX using the helper [[Example]] and [[Preview]] components. These component take a \`source\` prop, which is the name of the example file or code block in any of the [locations examples can exist](./01.writing.mdx).`

// test('transforms symbolic links correctly', async () => {
//   const processor = unified()
//     .use(rehypeParse)
//     .use(() => transformSymbolicLinks)
//     .use(rehypeStringify)
//   const outputHtml = await processor.process(symbolicLinksFixture)

//   expect(outputHtml).toMatchSnapshot()
// })

// const metaStringFixture = `
// # Hello

// \`\`\`tsx
// const foo = 'bar'
// \`\`\`
// `

// // TODO: Having ESM issues with this test.
// test.skip('meta props passed through', async () => {
//   const { compileSync } = await import('@mdx-js/mdx')
//   const result = compileSync(metaStringFixture, {
//     rehypePlugins: [() => addCodeMetaProps],
//   })

//   expect(result).toMatchSnapshot()
// })
