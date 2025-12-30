import {
  CodeBlock as DefaultCodeBlock,
  LineNumbers,
  Toolbar,
  type CodeBlockProps,
} from 'renoun'
import { GeistMono } from 'geist/font/mono'
import type { ComponentProps, ComponentType } from 'react'

const paddingBlock = '0.75rem'
const paddingInline = '1rem'
const padding = `${paddingBlock} ${paddingInline}`

export function CodeBlock({ components, ...props }: CodeBlockProps) {
  const isComponentOverride = (value: unknown): value is ComponentType<any> =>
    typeof value === 'function' ||
    (typeof value === 'object' && value !== null && '$$typeof' in value)

  const mergeSlotProps = <TProps extends { css?: any; className?: string }>(
    override: unknown,
    base: Partial<TProps>
  ): ComponentType<any> | Partial<TProps> => {
    if (isComponentOverride(override)) {
      return override
    }

    const overrideProps = (override ?? {}) as Partial<TProps>
    const mergedCss = {
      ...(base as any).css,
      ...(overrideProps as any).css,
    }
    const mergedClassName = [base.className, overrideProps.className]
      .filter(Boolean)
      .join(' ')

    return {
      ...base,
      ...overrideProps,
      ...(mergedClassName ? { className: mergedClassName } : null),
      ...(Object.keys(mergedCss).length ? { css: mergedCss } : null),
    }
  }

  const mergedComponents = {
    ...components,
    Container: mergeSlotProps<ComponentProps<'div'> & { css?: any }>(
      components?.Container,
      {
        className: GeistMono.className,
        css: {
          fontSize: 'var(--font-size-code-2)',
          lineHeight: 'var(--line-height-code-2)',
          width: 'calc(100% + 2rem)',
          margin: '0 -1rem',
        },
      }
    ),
    Toolbar: mergeSlotProps<ComponentProps<typeof Toolbar> & { css?: any }>(
      components?.Toolbar,
      { css: { padding } }
    ),
    LineNumbers: mergeSlotProps<
      ComponentProps<typeof LineNumbers> & { css?: any }
    >(components?.LineNumbers, { css: { padding } }),
    Code: mergeSlotProps<ComponentProps<'code'> & { css?: any }>(
      components?.Code,
      {
        css: {
          paddingBlock,
          paddingInline,
          paddingInlineStart: paddingInline,
        },
      }
    ),
  } satisfies NonNullable<CodeBlockProps['components']>

  return <DefaultCodeBlock {...props} components={mergedComponents} />
}
