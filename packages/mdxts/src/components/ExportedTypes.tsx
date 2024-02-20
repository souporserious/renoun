import React, { Fragment } from 'react'

import { getExportedTypes } from '../utils/get-exported-types'
import { CodeInline } from './CodeInline'
import { Context } from './Context'
import type { MDXComponents } from './MDXComponents'
import { MDXContent } from './MDXContent'
import { project } from './project'
import { getDiagnosticMessageText } from '@tsxmod/utils'

const mdxComponents = {
  p: (props) => <p {...props} style={{ margin: 0 }} />,
  code: (props) => {
    if (typeof props.children === 'string') {
      return <CodeInline value={props.children} language="typescript" />
    }
    return <code {...props} />
  },
} as MDXComponents

function Types({
  props,
  isComponent,
}: {
  props: any[] | null
  isComponent: boolean
}) {
  return props?.map((propType, index) => {
    if (propType === null) {
      return null
    }

    if (
      isComponent &&
      propType.unionProperties &&
      propType.unionProperties.length > 0
    ) {
      return (
        <div
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: '1.5rem',
          }}
        >
          <h4
            style={{
              fontWeight: 500,
              marginBottom: '2rem',
              color: 'var(--color-foreground-secondary)',
            }}
          >
            {propType.text}
          </h4>
          {propType.description && (
            <MDXContent
              value={propType.description}
              components={mdxComponents}
            />
          )}
          <div
            style={{
              padding: '0 1.5rem',
              margin: '0 0 0 -1.5rem',
              border: '1px solid var(--color-separator-secondary)',
              borderRadius: '1rem',
              position: 'relative',
            }}
          >
            <span
              className="title"
              style={{
                position: 'absolute',
                left: '2rem',
                top: 0,
                translate: '0 -50%',
                padding: '0.25rem 0.5rem',
                margin: '0 0 0 -1rem',
                borderRadius: '1rem',
                backgroundColor: 'var(--color-separator-secondary)',
              }}
            >
              Union
            </span>
            {propType.unionProperties.map((props: any, index: number) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      margin: '0 -1.5rem',
                    }}
                  >
                    <div
                      style={{
                        height: 1,
                        backgroundColor: 'var(--color-separator-secondary)',
                      }}
                    />
                    <div style={{ height: 1 }}>
                      <span
                        style={{
                          fontSize: 'var(--font-size-body-2)',
                          padding: '0.1rem 1rem 0.25rem',
                          border: '1px solid var(--color-separator-secondary)',
                          borderRadius: '1rem',
                          color: 'var(--color-foreground-secondary)',
                          position: 'relative',
                          top: '-0.95rem',
                          userSelect: 'none',
                        }}
                      >
                        or
                      </span>
                    </div>
                    <div
                      style={{
                        height: 1,
                        backgroundColor: 'var(--color-separator-secondary)',
                      }}
                    />
                  </div>
                ) : null}
                <Types props={props} isComponent={isComponent} />
              </Fragment>
            ))}
          </div>
          <Types props={propType.properties} isComponent={isComponent} />
        </div>
      )
    }

    if (propType.name === null) {
      return propType.properties ? (
        <div
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <Types props={propType.properties} isComponent={isComponent} />
        </div>
      ) : (
        <div key={index}>
          & <CodeInline value={propType.text} language="typescript" />
        </div>
      )
    }

    return (
      <div
        key={propType.name}
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem 0',
          gap: '0.8rem',
          borderTop: index === 0 ? 'none' : '1px solid var(--color-separator)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <h4
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              flexShrink: 0,
              margin: 0,
              fontWeight: 400,
              color: 'var(--color-foreground-secondary)',
            }}
          >
            {propType.name}{' '}
            {propType.required && (
              <span style={{ color: 'oklch(0.8 0.15 36.71)' }} title="required">
                *
              </span>
            )}
          </h4>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
            }}
          >
            <CodeInline
              value={propType.text}
              language="typescript"
              paddingHorizontal="0.5rem"
              paddingVertical="0.2rem"
            />
            {propType.defaultValue ? (
              <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>
                ={' '}
                <CodeInline
                  value={propType.defaultValue}
                  language="typescript"
                />
              </span>
            ) : null}
          </div>
        </div>
        {propType.description && (
          <MDXContent value={propType.description} components={mdxComponents} />
        )}

        {propType.properties && propType.properties.length > 0 ? (
          <div style={{ paddingLeft: '2rem' }}>
            <Types props={propType.properties} isComponent={isComponent} />
          </div>
        ) : null}
      </div>
    )
  })
}

type BaseAPIReferenceProps = {
  theme?: any
  workingDirectory?: string
}

type APIReferenceProps = BaseAPIReferenceProps &
  ({ source: string } | { filename: string; value: string })

/** Display type documentation for all exported types from a module or source code value. */
export function ExportedTypes(props: APIReferenceProps) {
  const sourceFile =
    'source' in props
      ? project.getSourceFileOrThrow(props.source)
      : project.createSourceFile(props.filename, props.value, {
          overwrite: true,
        })
  const diagnostics = sourceFile
    .getPreEmitDiagnostics()
    .map((diagnostic) => diagnostic.getMessageText())

  if (diagnostics.length > 0) {
    throw new Error(
      diagnostics
        .map((diagnostic) => getDiagnosticMessageText(diagnostic))
        .join('\n')
    )
  }

  const exportedTypes = getExportedTypes(sourceFile)

  return (
    <Context
      value={{
        theme: props.theme,
        workingDirectory: props.workingDirectory,
      }}
    >
      {exportedTypes.map((type, index) => {
        return (
          <div
            key={type.name}
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '1.6rem 0',
              borderTop:
                index === 0
                  ? undefined
                  : '1px solid var(--color-separator-secondary)',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.8rem',
                marginBottom: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '1rem',
                }}
              >
                <h3 id={type.slug} style={{ fontWeight: 500, margin: 0 }}>
                  {type.name}
                </h3>
              </div>
              {type.description ? (
                <MDXContent
                  value={type.description}
                  components={mdxComponents}
                />
              ) : null}
            </div>

            {type.types.length > 0 ? (
              <Types props={type.types} isComponent={type.isComponent} />
            ) : null}
          </div>
        )
      })}
    </Context>
  )
}
