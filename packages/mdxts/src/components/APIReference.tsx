/** @jsxImportSource restyle */
import { Fragment } from 'react'
import type { CSSObject } from 'restyle'

import type { ExportSource } from '../collections'
import { CodeInline, MDXComponents, MDXContent } from '../components'
import { createSlug } from '../utils/create-slug'
import type { AllTypes, ResolvedType, TypeOfKind } from '../utils/resolve-type'
import { isParameterType, isPropertyType } from '../utils/resolve-type'

const mdxComponents = {
  p: (props) => <p {...props} css={{ margin: 0 }} />,
  code: (props) => <MDXComponents.code {...props} paddingY="0" />,
} satisfies MDXComponents

export async function APIReference({ source }: { source: ExportSource<any> }) {
  const type = await source.getType()

  if (type === undefined) {
    return null
  }

  return (
    <div
      key={type.name}
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '1.6rem 0',
        borderBottom: '1px solid var(--color-separator-secondary)',
      }}
    >
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.8rem',
        }}
      >
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <h3
            id={type.name ? createSlug(type.name) : undefined}
            css={{ flexShrink: 0, fontWeight: 500, margin: 0 }}
          >
            {type.name}
          </h3>

          <CodeInline value={type.text} language="typescript" />

          {/* {type.path && <ViewSource href={type.path} />} */}
        </div>

        {type.description ? (
          <MDXContent value={type.description} components={mdxComponents} />
        ) : null}
      </div>

      <div css={{ display: 'flex' }}>
        <TypeChildren type={type} css={{ marginTop: '2rem' }} />
      </div>
    </div>
  )
}

/** Determines how to render the immediate type children based on its kind. */
function TypeChildren({
  type,
  css: cssProp,
}: {
  type: ResolvedType
  css: CSSObject
}) {
  if (
    type.kind === 'Enum' ||
    type.kind === 'Generic' ||
    type.kind === 'Symbol' ||
    type.kind === 'Reference'
  ) {
    return <CodeInline value={type.text} language="typescript" />
  }

  if (
    type.kind === 'Object' ||
    type.kind === 'Intersection' ||
    type.kind === 'Union'
  ) {
    return <TypeProperties type={type} css={cssProp} />
  }

  if (type.kind === 'Class') {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          ...cssProp,
        }}
      >
        {type.accessors && type.accessors.length > 0 ? (
          <div css={{ marginTop: '1rem' }}>
            <h4>Accessors</h4>
            {type.accessors.map((accessor, index) => (
              <TypeValue key={index} type={accessor} />
            ))}
          </div>
        ) : null}
        <h4>Constructors</h4>
        {type.constructors?.map((constructor, index) => (
          <TypeValue key={index} type={constructor} />
        ))}
        {type.methods && type.methods.length > 0 ? (
          <div css={{ marginTop: '1rem' }}>
            <h4>Methods</h4>
            {type.methods.map((method, index) => (
              <TypeValue key={index} type={method} />
            ))}
          </div>
        ) : null}
        {type.properties && type.properties.length > 0 ? (
          <div css={{ marginTop: '1rem' }}>
            <h4>Properties</h4>
            {type.properties.map((property, index) => (
              <TypeValue key={index} type={property} />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (type.kind === 'Component') {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          ...cssProp,
        }}
      >
        <h4 css={{ margin: 0 }}>Signatures</h4>
        {type.signatures.map((signature, index) => {
          return (
            <Fragment key={index}>
              {signature.parameter ? (
                <div css={{ marginTop: '1rem' }}>
                  <h5 css={{ margin: '0 0 1rem' }}>Parameters</h5>
                  {signature.parameter.kind === 'Object' ? (
                    <TypeProperties type={signature.parameter} />
                  ) : signature.parameter.kind === 'Reference' ? (
                    signature.parameter.text
                  ) : (
                    <TypeValue type={signature.parameter} />
                  )}
                </div>
              ) : null}
              {signature.returnType ? (
                <div>
                  <h5>Return</h5>
                  {signature.returnType}
                </div>
              ) : null}
            </Fragment>
          )
        })}
      </div>
    )
  }

  if (type.kind === 'Function') {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          ...cssProp,
        }}
      >
        <h4 css={{ margin: 0 }}>Signatures</h4>
        {type.signatures.map((signature, index) => {
          return (
            <Fragment key={index}>
              {signature.parameters.length > 0 ? (
                <div css={{ marginTop: '1rem' }}>
                  <h5 css={{ margin: 0 }}>Parameters</h5>
                  {signature.parameters.map((parameter, index) => (
                    <TypeValue key={index} type={parameter} />
                  ))}
                </div>
              ) : null}
              {signature.returnType ? (
                <div css={{ marginTop: '1rem' }}>
                  <h5>Return</h5>
                  {signature.returnType}
                </div>
              ) : null}
            </Fragment>
          )
        })}
      </div>
    )
  }

  console.log('[APIReference:TypeChildren] Did not render: ', type)

  return null
}

/** Determines how to render the immediate type properties accounting for unions. */
function TypeProperties({
  type,
  css: cssProp,
}: {
  type: TypeOfKind<'Object' | 'Intersection' | 'Union'>
  css?: CSSObject
}) {
  if (type.kind === 'Union') {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          ...cssProp,
        }}
      >
        {type.members.map((member, index) =>
          member.kind === 'Object' ||
          member.kind === 'Intersection' ||
          member.kind === 'Union' ? (
            <TypeProperties key={index} type={member} />
          ) : member.kind === 'Reference' ? (
            member.text
          ) : (
            <TypeValue key={index} type={member} />
          )
        )}
      </div>
    )
  }

  if (type.properties.length) {
    return (
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1.5rem',
          gap: '1.2rem',
          ...cssProp,
        }}
      >
        <h4>Properties</h4>
        {type.properties.map((propertyType, index) => (
          <TypeValue key={index} type={propertyType} />
        ))}
      </div>
    )
  }

  console.log('[APIReference:TypeProperties] Did not render: ', type)

  return null
}

/** Renders a type value with its name, type, and description. */
function TypeValue({
  type,
  css: cssProp,
}: {
  type: AllTypes
  css?: CSSObject
}) {
  const isNameSameAsType = type.name === type.text
  let isRequired = false
  let defaultValue

  if (isParameterType(type) || isPropertyType(type)) {
    isRequired = !type.isOptional
    defaultValue = type.defaultValue
  }

  return (
    <div
      key={type.name + type.text}
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem 0',
        gap: '0.8rem',
        ...cssProp,
      }}
    >
      <div
        css={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <h4
          css={{
            display: 'flex',
            alignItems: 'flex-start',
            flexShrink: 0,
            margin: 0,
            fontWeight: 400,
            color: 'var(--color-foreground-secondary)',
          }}
        >
          {type.name}{' '}
          {isRequired && (
            <span css={{ color: 'oklch(0.8 0.15 36.71)' }} title="required">
              *
            </span>
          )}
        </h4>
        <div
          css={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          {isNameSameAsType ? null : (
            <CodeInline
              value={type.text}
              language="typescript"
              paddingX="0.5rem"
              paddingY="0.2rem"
              css={{ fontSize: 'var(--font-size-body-2)' }}
            />
          )}
          {defaultValue ? (
            <span
              css={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              ={' '}
              <CodeInline
                value={JSON.stringify(defaultValue)}
                language="typescript"
              />
            </span>
          ) : null}
        </div>
      </div>

      {type.description && (
        <MDXContent value={type.description} components={mdxComponents} />
      )}

      {type.kind === 'Object' && type.properties
        ? type.properties.map((propertyType, index) => (
            <TypeValue
              key={index}
              type={propertyType}
              css={{ paddingLeft: '1.5rem' }}
            />
          ))
        : null}

      {type.kind === 'Function' && type.signatures && type.signatures.length
        ? type.signatures.map((signature) =>
            signature.parameters.map((parameter, index) => (
              <TypeValue
                key={index}
                type={parameter}
                css={{ paddingLeft: '1.5rem' }}
              />
            ))
          )
        : null}
    </div>
  )
}
