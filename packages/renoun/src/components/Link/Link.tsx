import React from 'react'
import { css, type CSSObject } from 'restyle'

import {
  Repository,
  type RepositoryConfig,
  type GetReleaseUrlOptions,
  type Release,
  type ReleaseSpecifier,
} from '../../file-system/Repository.js'
import { getConfig } from '../Config/ServerConfigContext.js'
import { Logo } from '../Logo.js'

const VARIANT_METHODS = {
  edit: 'getEditUrl',
  history: 'getHistoryUrl',
  raw: 'getRawUrl',
  blame: 'getBlameUrl',
  source: 'getSourceUrl',
  editor: 'getEditorUri',
  release: 'getReleaseUrl',
} as const

type ConfigVariants = 'repository' | 'owner' | 'branch' | 'issue'

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

type ReleaseLinkOptions = GetReleaseUrlOptions & {
  repository?: Repository | RepositoryConfig | string
}

export interface LinkReleaseContext extends Release {
  /** Original tag name from the provider (e.g. GitHub `tag_name`). */
  rawTagName?: string

  /** Original release name/title from the provider. */
  rawName?: string

  /** Primary tag identifier, normalized from the underlying release. */
  tag?: string

  /** Package or display name, normalized from the underlying release. */
  name?: string

  /** Normalized label suitable for display. */
  label: string

  /** String representation when rendered in a string context. */
  toString(): string
}

function createLinkReleaseContext(release: Release): LinkReleaseContext {
  const rawTagName = release.tagName
  const rawName = release.name

  let name = rawName
  let tag = rawTagName

  const parseNameAndTag = (input: string | undefined) => {
    if (!input) return

    const atIndex = input.lastIndexOf('@')
    if (atIndex <= 0 || atIndex >= input.length - 1) {
      return
    }

    const candidateName = input.slice(0, atIndex)
    const candidateTag = input.slice(atIndex + 1)

    // Heuristic: treat the suffix as a tag/version only when it looks version-like.
    if (!/\d/.test(candidateTag)) {
      return
    }

    name = candidateName
    tag = candidateTag
  }

  // Prefer parsing from the release name (e.g. "package@1.2.3") and then from the tag.
  parseNameAndTag(rawName)
  if (!tag) {
    parseNameAndTag(rawTagName)
  }

  const label =
    name && tag ? `${name}@${tag}` : (rawTagName ?? rawName ?? 'View release')

  return {
    ...release,
    rawTagName,
    rawName,
    tag,
    name,
    label,
    toString() {
      return label
    },
  }
}

export interface LinkReleaseRenderContext {
  /** The URL of the release. */
  href: string

  /** The tag of the release. */
  tag?: string

  /** The name of the release. */
  name?: string

  /** The tag and name of the release. */
  label: `${string}@${string}`

  /** ISO timestamp for when the release was published, if provided by the host. */
  publishedAt?: string

  /** Indicates whether the release is marked as a prerelease. */
  isPrerelease: boolean

  /** Indicates whether the release is marked as a draft. */
  isDraft: boolean
}

interface LinkBaseRenderContext {
  /** The URL of the link. */
  href: string
}

type LinkContextFor<Variant extends LinkVariant> = Variant extends 'release'
  ? LinkReleaseRenderContext
  : LinkBaseRenderContext

type InternalLinkContextFor<Variant extends LinkVariant> =
  Variant extends 'release' ? LinkReleaseContext : undefined

type LinkChildren<Variant extends LinkVariant> =
  | React.ReactNode
  | ((context: LinkContextFor<Variant>) => React.ReactNode)

type AnchorBaseProps = Omit<
  React.ComponentPropsWithRef<'a'>,
  'href' | 'children'
> & { css?: CSSObject }

type ConfigVariantProps<Variant extends ConfigVariants> =
  Variant extends 'branch'
    ? {
        variant?: 'branch'
        source?: never
        options?: { ref?: string }
      }
    : {
        variant: Exclude<Variant, 'branch'>
        source?: never
        options?: never
      }

export type LinkProps<
  Source,
  Variant extends LinkVariant = 'source',
> = Variant extends 'release'
  ? AnchorBaseProps & {
      /** Entry to derive the href from. */
      source?: Source

      /** Which getter to use for the href. */
      variant?: Variant

      /** Optional package name to filter releases in monorepos. */
      packageName?: string

      /** Which release to resolve. */
      release?: ReleaseSpecifier

      /** Force a refresh of the cached release metadata. */
      refresh?: boolean

      /** Select a downloadable asset by heuristic or matcher. */
      asset?: true | string | RegExp

      /** Link to the release source archive. */
      archiveSource?: 'zip' | 'tar'

      /** Link to a compare view from this ref to the resolved release. */
      compare?: string

      /** Override repository for computing release URL. */
      repository?: Repository | RepositoryConfig | string

      /** The content of the link. */
      children?: LinkChildren<Variant>
    }
  : Variant extends keyof typeof VARIANT_METHODS
    ? AnchorBaseProps & {
        /** Entry to derive the href from. */
        source: Source

        /** Which getter to use for the href. */
        variant?: Variant

        /** Options forwarded to the variant getter method. */
        options?: VariantOptions<Source, Variant>

        /** The content of the link. */
        children?: LinkChildren<Variant>
      }
    : Variant extends ConfigVariants
      ? AnchorBaseProps &
          ConfigVariantProps<Extract<Variant, ConfigVariants>> & {
            /** The content of the link. */
            children?: LinkChildren<Variant>
          }
      : never

async function computeLink<Source, Variant extends LinkVariant>({
  source,
  variant,
  options,
}: {
  source?: Source
  variant: Variant
  options?: any
}): Promise<{ href: string; context: InternalLinkContextFor<Variant> }> {
  const config = await getConfig()

  if (variant === 'release') {
    const releaseOptions = options as ReleaseLinkOptions | undefined

    if (
      source &&
      VARIANT_METHODS.release &&
      typeof (source as any)[VARIANT_METHODS.release] === 'function'
    ) {
      const methodName = VARIANT_METHODS.release
      const method = (source as any)[methodName] as (
        options?: ReleaseLinkOptions
      ) => Promise<string> | string

      const href = await method.call(source, releaseOptions)

      const releaseGetter = (source as any).getRelease as
        | ((options?: ReleaseLinkOptions) => Promise<Release>)
        | undefined

      if (typeof releaseGetter !== 'function') {
        throw new Error(
          `[renoun] Link variant "${String(variant)}" is not supported for this source.`
        )
      }

      const release = await releaseGetter.call(source, releaseOptions)
      const context = createLinkReleaseContext(release)

      return {
        href,
        context: context as InternalLinkContextFor<Variant>,
      }
    }

    const { repository: repositoryOverride, ...restOptions } =
      releaseOptions ?? {}

    let repository: Repository

    if (repositoryOverride) {
      repository =
        repositoryOverride instanceof Repository
          ? repositoryOverride
          : new Repository(repositoryOverride)
    } else {
      const gitConfig = config.git
      if (!gitConfig) {
        throw new Error(
          '[renoun] Git configuration is required to compute this Link variant. Ensure `RootProvider` is configured with a `git` repository.'
        )
      }

      const required: (keyof typeof gitConfig)[] = [
        'baseUrl',
        'owner',
        'repository',
        'branch',
        'source',
        'host',
      ]

      for (const key of required) {
        if (!(key in gitConfig) || gitConfig[key] === undefined) {
          throw new Error(
            `[renoun] Missing git configuration field: "${String(
              key
            )}". Please configure RootProvider with a valid git object or shorthand (e.g. "owner/repo#branch").`
          )
        }
      }

      repository = new Repository({
        baseUrl: gitConfig.baseUrl,
        host: gitConfig.host,
        owner: gitConfig.owner,
        repository: gitConfig.repository,
        branch: gitConfig.branch,
      } as RepositoryConfig)
    }

    const release = await repository.getRelease(restOptions)
    const href = await repository.getReleaseUrl(restOptions)
    const context = createLinkReleaseContext(release)

    return {
      href,
      context: context as InternalLinkContextFor<Variant>,
    }
  }

  if (VARIANT_METHODS[variant as keyof typeof VARIANT_METHODS]) {
    const methodName = VARIANT_METHODS[variant as keyof typeof VARIANT_METHODS]
    const method = source && source[methodName as keyof typeof source]

    if (typeof method !== 'function') {
      throw new Error(
        `[renoun] Link variant "${String(variant)}" is not supported for this source.`
      )
    }

    if (methodName.endsWith('Url')) {
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
            `[renoun] Missing git configuration field: "${String(
              key
            )}". Please configure RootProvider with a valid git object or shorthand (e.g. "owner/repo#branch").`
          )
        }
      }
    }

    if (methodName === 'getEditorUri') {
      const editorOptions =
        options && typeof options === 'object'
          ? { ...(options as Record<string, any>) }
          : undefined

      if (
        config.editor &&
        (editorOptions?.['editor'] === undefined ||
          editorOptions?.['editor'] === null)
      ) {
        if (editorOptions) {
          editorOptions['editor'] = config.editor
        } else {
          const href = await (method as any).call(source, {
            editor: config.editor,
          })
          return { href, context: undefined as InternalLinkContextFor<Variant> }
        }
      }

      const href = await (method as any).call(source, editorOptions)
      return { href, context: undefined as InternalLinkContextFor<Variant> }
    }

    const needsRepository = methodName.endsWith('Url')
    const href = needsRepository
      ? await (method as any).call(source, {
          ...(options as any),
          repository: (options as any)?.repository ?? config.git!,
        })
      : await (method as any).call(source, options)

    return {
      href: href as string,
      context: undefined as InternalLinkContextFor<Variant>,
    }
  }

  const gitConfig = config.git
  if (!gitConfig) {
    throw new Error(
      '[renoun] Git configuration is required to compute this Link variant. Ensure `RootProvider` is configured with a `git` repository.'
    )
  }

  switch (variant as ConfigVariants) {
    case 'repository':
      return {
        href: gitConfig.source,
        context: undefined as InternalLinkContextFor<Variant>,
      }
    case 'owner':
      return {
        href: `${gitConfig.baseUrl}/${gitConfig.owner}`,
        context: undefined as InternalLinkContextFor<Variant>,
      }
    case 'branch': {
      const ref = (options as any)?.ref ?? gitConfig.branch
      return {
        href: `${gitConfig.source}/tree/${ref}`,
        context: undefined as InternalLinkContextFor<Variant>,
      }
    }
    case 'issue':
      return {
        href: `${gitConfig.source}/issues/new`,
        context: undefined as InternalLinkContextFor<Variant>,
      }
    default:
      throw new Error(`[renoun] Unsupported Link variant: ${String(variant)}`)
  }
}

/**
 * An anchor element that derives its `href` from a directory, file, module export,
 * or from the `RootProvider` config.
 */
export async function Link<Source, Variant extends LinkVariant = 'source'>(
  props: LinkProps<Source, Variant>
) {
  const {
    source,
    variant = 'source',
    children,
    css: cssProp,
    className,
    style,
    ...restProps
  } = props

  let computedOptions: any =
    variant === 'release' ? undefined : (props as any).options

  if (variant === 'release') {
    const {
      packageName,
      release,
      refresh,
      asset,
      archiveSource,
      compare,
      repository,
    } = props as LinkProps<Source, 'release'>

    const hasReleaseOptions =
      packageName !== undefined ||
      release !== undefined ||
      refresh !== undefined ||
      asset !== undefined ||
      archiveSource !== undefined ||
      compare !== undefined ||
      repository !== undefined

    computedOptions = hasReleaseOptions
      ? ({
          packageName,
          release,
          refresh,
          asset,
          source: archiveSource,
          compare,
          repository,
        } satisfies ReleaseLinkOptions)
      : undefined
  }

  const { href, context } = await computeLink<Source, Variant>({
    source,
    variant: variant as Variant,
    options: computedOptions,
  })

  if (typeof children === 'function') {
    const render = children as (
      context: LinkContextFor<Variant>
    ) => React.ReactNode

    if (variant === 'release') {
      const releaseContext = context as InternalLinkContextFor<'release'>
      const publicContext = {
        href,
        tag: releaseContext?.tag,
        name: releaseContext?.name,
        label: releaseContext?.label ?? href,
        publishedAt: releaseContext?.publishedAt,
        isPrerelease: releaseContext?.isPrerelease ?? false,
        isDraft: releaseContext?.isDraft ?? false,
      } as LinkContextFor<Variant>

      return render(publicContext)
    }

    const baseContext = { href } as LinkContextFor<Variant>
    return render(baseContext)
  }

  let childrenToRender = children

  if (variant === 'release') {
    const releaseContext = context as InternalLinkContextFor<'release'>
    const releaseLabel = releaseContext.label

    if (!children) {
      childrenToRender = releaseLabel
    }
  } else if (!children && variant === 'repository') {
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
