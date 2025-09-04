import { CodeBlock, Tokens, type JavaScriptModuleExport } from 'renoun'
import { keyframes } from 'restyle'
import { GeistMono } from 'geist/font/mono'

import { Collapse } from './Collapse'

export async function CodePreview({
  fileExport,
}: {
  fileExport: JavaScriptModuleExport<React.ComponentType>
}) {
  const name = fileExport.getName()
  const slug = fileExport.getSlug()
  const Value = await fileExport.getRuntimeValue()
  const isUppercase = name[0] === name[0].toUpperCase()
  const isComponent = typeof Value === 'function' && isUppercase
  const code = await fileExport.getText({ includeDependencies: true })

  return (
    <section
      id={slug}
      css={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 5,
        width: 'calc(100% + 2rem)',
        margin: '0 -1rem',
      }}
    >
      <HeroExample code={code}>
        <div
          css={{
            display: 'grid',
            gridTemplateRows: isComponent ? 'minmax(16rem, 1fr)' : undefined,
            borderRadius: 5,
            overflow: 'clip',
            padding: '1.25rem 1rem 0.75rem',
            backgroundColor: 'var(--color-surface-secondary)',
          }}
        >
          {isComponent ? (
            <div
              css={{
                display: 'grid',
                minHeight: '16rem',
                borderRadius: 3,
                backgroundColor: 'var(--color-surface)',
                backgroundSize: '1rem 1rem',
                backgroundPosition: '0.5rem 0.5rem',
                backgroundImage: `radial-gradient(circle, #8b949d54 1px, transparent 1px)`,
                backgroundRepeat: 'round',
                boxShadow: 'inset 0 0 0 1px var(--color-separator-secondary)',
                overflow: 'hidden',
              }}
            >
              <div
                css={{
                  fontSize: '1rem',
                  lineHeight: '1.35',
                  maxWidth: '-webkit-fill-available',
                  padding: '4rem',
                  margin: 'auto',
                  overflow: 'auto',
                  width: '100%',
                }}
              >
                <Value />
              </div>
            </div>
          ) : null}
        </div>
      </HeroExample>
    </section>
  )
}

function HeroExample({
  children,
  code,
}: {
  children: React.ReactNode
  code: string
}) {
  return (
    <Collapse.Provider>
      {children}

      <div css={{ position: 'relative' }}>
        <ChipFadeIn />
        <ChipFadeOut />
        <Collapse.Content height={{ initial: 200, open: 'auto' }}>
          <CodeBlock language="tsx">
            <pre
              css={{
                position: 'relative',
                whiteSpace: 'pre',
                wordWrap: 'break-word',
                fontSize: 'var(--font-size-code-2)',
                lineHeight: 'var(--line-height-code-2)',
                padding: '0.75rem 1rem',
                // Reserve space at the bottom for the footer/label
                paddingBottom: 'calc(0.75rem + 2.5rem + 0.5rem)',
                backgroundColor: 'var(--color-surface-secondary)',
                overflow: 'auto',

                '[data-state="closed"] &': {
                  overflow: 'hidden',
                },
              }}
              className={GeistMono.className}
            >
              <Tokens>{code}</Tokens>
            </pre>
          </CodeBlock>
        </Collapse.Content>

        {/* Gradient overlay: visible only when collapsed; covers code and button area */}
        <div
          css={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            opacity: 1,
            transition: 'opacity 400ms ease',
            willChange: 'opacity',
            ['--hero-button-height']: '2.5rem',
            ['--hero-depth']: '14rem',
            backgroundImage: `linear-gradient(
              to top,
              color-mix(in srgb, var(--color-surface-secondary) 62%, black) 0,
              color-mix(in srgb, var(--color-surface-secondary) 58%, black) var(--hero-button-height),
              color-mix(in srgb, var(--color-surface-secondary) 50%, transparent) calc(var(--hero-button-height) + calc(var(--hero-depth) * 0.15)),
              color-mix(in srgb, var(--color-surface-secondary) 42%, transparent) calc(var(--hero-button-height) + calc(var(--hero-depth) * 0.30)),
              color-mix(in srgb, var(--color-surface-secondary) 34%, transparent) calc(var(--hero-button-height) + calc(var(--hero-depth) * 0.45)),
              color-mix(in srgb, var(--color-surface-secondary) 26%, transparent) calc(var(--hero-button-height) + calc(var(--hero-depth) * 0.60)),
              color-mix(in srgb, var(--color-surface-secondary) 18%, transparent) calc(var(--hero-button-height) + calc(var(--hero-depth) * 0.75)),
              color-mix(in srgb, var(--color-surface-secondary) 10%, transparent) calc(var(--hero-button-height) + calc(var(--hero-depth) * 0.90)),
              color-mix(in srgb, var(--color-surface-secondary) 6%, transparent) calc(var(--hero-button-height) + calc(var(--hero-depth) * 0.97)),
              transparent calc(var(--hero-button-height) + var(--hero-depth))
            )`,
            '[data-state="open"] + &': {
              opacity: 0,
            },
          }}
          aria-hidden
        />

        {/* Single trigger that morphs from overlay (closed) to footer (open) */}
        <Collapse.Trigger
          css={{
            // Closed state: full overlay clickable area
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-foreground-interactive)',
            '[data-state="open"] ~ &': {
              top: 'auto',
              bottom: 0,
              left: 0,
              right: 0,
              height: '2.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderTop: '1px solid var(--color-separator)',
              background: 'none',
            },
            ':hover': {
              color: 'var(--color-foreground-interactive-highlighted)',
            },
            ':focus-visible': {
              outline: '2px solid var(--color-foreground-interactive)',
              outlineOffset: 2,
            },
          }}
          aria-label="Toggle code visibility"
        >
          {{
            // While closed, render a bottom-centered label but keep the entire overlay clickable
            initial: (
              <span
                css={{
                  display: 'inline-block',
                  marginBottom: '0.5rem',
                  fontSize: 'var(--font-size-body-3)',
                  fontWeight: 'var(--font-weight-button)',
                  pointerEvents: 'none',
                  backgroundColor: 'hsl(0 0% 0% / 0)',
                  color: '#fff',
                  padding: '0.25rem 0.5rem',
                  borderRadius: 6,
                  opacity: 0,
                  transform: 'translateY(4px)',
                  transition: `opacity 200ms ease, transform 200ms ease, background 250ms ease`,
                  animation: `chipFadeIn 220ms ease-out 280ms both`,
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                  'button:hover &': {
                    opacity: 1,
                    transform: 'translateY(0)',
                    backgroundColor: 'var(--color-surface-primary-highlighted)',
                  },
                  'button:focus-visible &': {
                    opacity: 1,
                    transform: 'translateY(0)',
                    backgroundColor: 'var(--color-surface-primary-highlighted)',
                  },
                }}
              >
                Expand code
              </span>
            ),
            // While open the button acts as the entire footer
            open: (
              <span
                css={{
                  fontSize: 'var(--font-size-body-3)',
                  fontWeight: 'var(--font-weight-button)',
                  pointerEvents: 'none',
                  // Start with interactive then tightly fade to transparent on open
                  backgroundColor: 'transparent',
                  color: 'var(--color-foreground)',
                  padding: '0.25rem 0.5rem',
                  borderRadius: 6,
                  animation: `chipFadeOut 160ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                Collapse code
              </span>
            ),
          }}
        </Collapse.Trigger>
      </div>
    </Collapse.Provider>
  )
}

const ChipFadeIn = keyframes({
  from: { backgroundColor: 'transparent' },
  to: { backgroundColor: 'var(--color-surface-primary)' },
})

const ChipFadeOut = keyframes({
  from: { backgroundColor: 'var(--color-surface-interactive)' },
  to: { backgroundColor: 'transparent' },
})
