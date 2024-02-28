import React, { Fragment } from 'react'
import { isAbsolute, join } from 'node:path'

import { getExportedTypes } from '../utils/get-exported-types'
import { CodeInline } from './CodeInline'
import { Context } from './Context'
import type { MDXComponents } from './MDXComponents'
import { MDXContent } from './MDXContent'
import { project } from './project'

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
  properties,
  isComponent,
}: {
  properties: any[] | null
  isComponent: boolean
}) {
  return properties?.map((propertyType, index) => {
    if (propertyType === null) {
      return null
    }

    if (isComponent && propertyType.unionProperties?.length) {
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
            {propertyType.text}
          </h4>

          {propertyType.description ? (
            <MDXContent
              value={propertyType.description}
              components={mdxComponents}
            />
          ) : null}

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
            {propertyType.unionProperties.map((props: any, index: number) => (
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
                <Types properties={props} isComponent={isComponent} />
              </Fragment>
            ))}
          </div>
          <Types
            properties={propertyType.properties}
            isComponent={isComponent}
          />
        </div>
      )
    }

    if (propertyType.name === null) {
      return propertyType.properties ? (
        <div
          key={index}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <Types
            properties={propertyType.properties}
            isComponent={isComponent}
          />
        </div>
      ) : (
        <div key={index}>
          & <CodeInline value={propertyType.text} language="typescript" />
        </div>
      )
    }

    return (
      <div
        key={propertyType.name}
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
            {propertyType.name}{' '}
            {propertyType.required ? (
              <span style={{ color: 'oklch(0.8 0.15 36.71)' }} title="required">
                *
              </span>
            ) : null}
          </h4>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <CodeInline
              value={propertyType.text}
              language="typescript"
              paddingHorizontal="0.5rem"
              paddingVertical="0.2rem"
            />
            {propertyType.defaultValue ? (
              <span
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                ={' '}
                <CodeInline
                  value={propertyType.defaultValue}
                  language="typescript"
                />
              </span>
            ) : null}
          </div>
        </div>

        {propertyType.description ? (
          <MDXContent
            value={propertyType.description}
            components={mdxComponents}
          />
        ) : null}

        {propertyType.properties?.length ? (
          <div style={{ paddingLeft: '2rem' }}>
            <Types
              properties={propertyType.properties}
              isComponent={isComponent}
            />
          </div>
        ) : null}
      </div>
    )
  })
}

type BaseExportedTypesProps = {
  /** Controls how types are rendered. */
  children?: (
    exportedTypes: ReturnType<typeof getExportedTypes>
  ) => React.ReactNode
}

type ExportedTypesProps =
  | ({ source: string } & BaseExportedTypesProps)
  | ({ filename: string; value: string } & BaseExportedTypesProps)

/** Display type documentation for all exported types from a module or source code value. */
export function ExportedTypes(props: ExportedTypesProps) {
  const privateProps = props as {
    theme?: any
    workingDirectory?: string
  }
  let sourcePropPath

  if ('source' in props) {
    const isRelative = !isAbsolute(props.source)
    const workingDirectory = privateProps.workingDirectory

    if (isRelative && !workingDirectory) {
      throw new Error(
        'The [workingDirectory] prop was not provided to the [ExportedTypes] component while using a relative path. Pass a valid [workingDirectory] or make sure the mdxts/remark plugin and mdxts/loader are configured correctly if this is being renderend in an MDX file.'
      )
    }

    sourcePropPath = isRelative
      ? join(workingDirectory!, props.source)
      : props.source
  }

  const sourceFile =
    'source' in props
      ? project.addSourceFileAtPath(sourcePropPath!) // TODO: there's currently diagnostic errors when this is outside the current project since not all files are loaded. Need to handle multiple projects.
      : project.createSourceFile(props.filename, props.value, {
          overwrite: true,
        })
  const exportedTypes = getExportedTypes(sourceFile)

  if (typeof props.children === 'function') {
    return (
      <Context
        value={{
          theme: privateProps.theme,
          workingDirectory: privateProps.workingDirectory,
        }}
      >
        {props.children(exportedTypes)}
      </Context>
    )
  }

  return (
    <Context
      value={{
        theme: privateProps.theme,
        workingDirectory: privateProps.workingDirectory,
      }}
    >
      {exportedTypes.map((declaration, index) => {
        return (
          <div
            key={declaration.name}
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
                <h3
                  id={declaration.slug}
                  style={{ fontWeight: 500, margin: 0 }}
                >
                  {declaration.name}
                </h3>
              </div>
              {declaration.description ? (
                <MDXContent
                  value={declaration.description}
                  components={mdxComponents}
                />
              ) : null}
            </div>

            {declaration.types.length > 0 ? (
              <Types
                properties={declaration.types}
                isComponent={declaration.isComponent}
              />
            ) : null}
          </div>
        )
      })}
    </Context>
  )
}
