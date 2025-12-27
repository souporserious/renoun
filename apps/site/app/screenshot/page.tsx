import { CodeBlock } from '@/components/CodeBlock'
import { ScreenshotPageClient } from './ScreenshotPageClient'

const codeExample = `import { screenshot } from '@renoun/screenshot'

const url = await screenshot.url(document.body, {
  scale: 2,
  format: 'png',
})`

export default function ScreenshotPage() {
  return (
    <ScreenshotPageClient
      codeBlockPlaceholder={
        <CodeBlock
          allowErrors
          language="tsx"
          css={{
            container: {
              width: '100%',
              margin: 0,
              padding: '1rem',
            },
          }}
        >
          {codeExample}
        </CodeBlock>
      }
    />
  )
}
