import React from 'react'
import { css, type CSSObject } from 'restyle'

import { getConfig } from '../Config/ServerConfigContext.js'
import { Logo } from '../Logo.js'

const VARIANT_METHODS = {
  edit: 'getEditUrl',
  history: 'getHistoryUrl',
  raw: 'getRawUrl',
  blame: 'getBlameUrl',
  source: 'getSourceUrl',
  editor: 'getEditorUri',
} as const

type ConfigVariants = 'gitHost' | 'repository' | 'owner' | 'branch' | 'issue'

export type LinkVariant = keyof typeof VARIANT_METHODS | ConfigVariants

type VariantMethodName<Variant extends LinkVariant> =
  Variant extends keyof typeof VARIANT_METHODS
    ? (typeof VARIANT_METHODS)[Variant]
    : never

type VariantOptions<
  Source,
  Variant extends LinkVariant,
> = Variant extends keyof typeof VARIANT_METHODS
  ? Source extends {
      [MethodName in VariantMethodName<Variant>]: (
        options?: infer Options
      ) => any
    }
    ? Options
    : never
  : { ref?: string } | undefined

type AnchorBaseProps = Omit<
  React.ComponentPropsWithRef<'a'>,
  'href' | 'children'
> & { css?: CSSObject }

type ConfigVariantProps<V extends ConfigVariants> = V extends 'branch'
  ? {
      variant: 'branch'
      source?: never
      options?: { ref?: string }
    }
  : {
      variant: Exclude<V, 'branch'>
      source?: never
      options?: never
    }

export type LinkProps<
  Source,
  Variant extends LinkVariant = LinkVariant,
> = Variant extends keyof typeof VARIANT_METHODS
  ? AnchorBaseProps & {
      /** Entry to derive the href from. */
      source: Source

      /** Which getter to use for the href. */
      variant: Variant

      /** Options forwarded to the variant getter method. */
      options?: VariantOptions<Source, Variant>

      /** The content of the link. */
      children?: React.ReactNode | ((href: string) => React.ReactNode)
    }
  : Variant extends ConfigVariants
    ? AnchorBaseProps &
        ConfigVariantProps<Extract<Variant, ConfigVariants>> & {
          /** The content of the link. */
          children?: React.ReactNode | ((href: string) => React.ReactNode)
        }
    : never

function computeHref<Source, Variant extends LinkVariant>({
  source,
  variant,
  options,
}: {
  source?: Source
  variant: Variant
  options?: VariantOptions<Source, Variant> | undefined
}) {
  const config = getConfig()

  if (VARIANT_METHODS[variant as keyof typeof VARIANT_METHODS]) {
    const methodName = VARIANT_METHODS[variant as keyof typeof VARIANT_METHODS]
    const method = source && source[methodName as keyof typeof source]

    if (typeof method !== 'function') {
      throw new Error(
        `[renoun] Link variant "${String(variant)}" is not supported for this source.`
      )
    }

    if (methodName.endsWith('Url')) {
      // Ensure git config exists for URL variants
      if (!config.git) {
        throw new Error(
          '[renoun] Git configuration is required to compute this Link variant. Ensure `RootProvider` is configured with a `git` repository.'
        )
      }
      const required: (keyof NonNullable<typeof config.git>)[] = [
        'baseUrl',
        'owner',
        'repository',
        'branch',
        'source',
        'host',
      ]
      for (const key of required) {
        if (!(key in config.git!) || config.git[key] === undefined) {
          throw new Error(
            `[renoun] Missing git configuration field: "${String(key)}". Please configure \
RootProvider with a valid git object or shorthand (e.g. "owner/repo#branch").`
          )
        }
      }
    }

    const needsRepository = methodName.endsWith('Url')
    const href = needsRepository
      ? method.call(source, {
          ...(options as any),
          repository: (options as any)?.repository ?? config.git!,
        })
      : method.call(source, options)

    return href as string
  }

  const gitConfig = config.git
  if (!gitConfig) {
    throw new Error(
      '[renoun] Git configuration is required to compute this Link variant. Ensure `RootProvider` is configured with a `git` repository.'
    )
  }

  switch (variant as ConfigVariants) {
    case 'gitHost':
      return gitConfig.baseUrl
    case 'repository':
      return gitConfig.source
    case 'owner':
      return `${gitConfig.baseUrl}/${gitConfig.owner}`
    case 'branch': {
      const ref = (options as any)?.ref ?? gitConfig.branch
      return `${gitConfig.source}/tree/${ref}`
    }
    case 'issue':
      return `${gitConfig.source}/issues/new`
    default:
      throw new Error(`[renoun] Unsupported Link variant: ${String(variant)}`)
  }
}

/**
 * An anchor element that derives its `href` from a directory, file, module export,
 * or from the `RootProvider` config.
 */
export function Link<Source, Variant extends LinkVariant = LinkVariant>(
  props: LinkProps<Source, Variant>
) {
  const {
    source,
    variant,
    options,
    children,
    css: cssProp,
    className,
    style,
    ...restProps
  } = props
  const href = computeHref({ source, variant, options })

  if (typeof children === 'function') {
    return children(href)
  }

  let childrenToRender = children

  if (!children && (variant === 'gitHost' || variant === 'repository')) {
    childrenToRender = <Logo variant="gitHost" width="100%" height="100%" />
  }

  let classNames: string | undefined
  let Styles: React.FC | null = null
  if (cssProp) {
    ;[classNames, Styles] = css(cssProp)
  }

  const mergedClassName = className
    ? classNames
      ? `${classNames} ${className}`
      : className
    : classNames

  return (
    <a {...restProps} href={href} className={mergedClassName} style={style}>
      {childrenToRender}
      {Styles ? <Styles /> : null}
    </a>
  )
}
