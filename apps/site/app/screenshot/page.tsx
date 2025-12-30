import { CodeBlock } from '@/components/CodeBlock'
import { ScreenshotPageClient } from './ScreenshotPageClient'

const codeExample = `import { screenshot } from '@renoun/screenshot'

const url = await screenshot.url(document.body, {
  format: 'png',
  scale: 2,
})`

export default function ScreenshotPage() {
  return (
    <ScreenshotPageClient
      codeBlockPlaceholder={
        <CodeBlock
          allowErrors
          language="tsx"
          components={{
            Container: {
              css: {
                width: '100%',
                margin: 0,
                fontSize: '0.75rem',
                lineHeight: '1.5',
              },
            },
          }}
        >
          {codeExample}
        </CodeBlock>
      }
    />
  )
}
