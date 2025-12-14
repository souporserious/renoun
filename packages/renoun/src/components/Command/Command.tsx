import React, { useId } from 'react'
import { styled, type CSSObject } from 'restyle'

import { getThemeColors } from '../../utils/get-theme.ts'
import { getConfig } from '../Config/ServerConfigContext.tsx'
import { Tokens } from '../CodeBlock/Tokens.ts'
import { CopyCommand } from './CopyCommand.ts'
import { CommandClient } from './CommandClient.ts'

const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const
type PackageManager = (typeof PACKAGE_MANAGERS)[number]

export type CommandVariant =
  | 'install'
  | 'install-dev'
  | 'run'
  | 'exec'
  | 'create'

const installBase = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  yarn: 'yarn add',
  bun: 'bun add',
} as const

const installDevFlags = {
  npm: '--save-dev',
  pnpm: '--save-dev',
  yarn: '--dev',
  bun: '--dev',
} as const

const EXACT_VERSION_PATTERN = /^(\d+\.\d+\.\d+)(?:[-+].+)?$/
const DIST_TAG_PATTERN = /^[a-zA-Z][\w.-]*$/

type PackageValidationResult = {
  name: string
  version?: string
}

function isPackageSpec(token: string) {
  return Boolean(token) && !token.startsWith('-')
}

function parsePackageSpec(token: string): PackageValidationResult | null {
  if (!isPackageSpec(token)) {
    return null
  }

  if (token.startsWith('@')) {
    const atIndex = token.lastIndexOf('@')
    if (atIndex > 0) {
      const name = token.slice(0, atIndex)
      const version = token.slice(atIndex + 1)
      if (version) {
        return { name, version }
      }
    }
    return { name: token }
  }

  const atIndex = token.lastIndexOf('@')
  if (atIndex > 0) {
    const name = token.slice(0, atIndex)
    const version = token.slice(atIndex + 1)
    if (version) {
      return { name, version }
    }
  }

  return { name: token }
}

async function validatePackage({ name, version }: PackageValidationResult) {
  const encodedName = encodeURIComponent(name)
  const response = await fetch(`https://registry.npmjs.org/${encodedName}`)
  if (!response.ok) {
    throw new Error(`[renoun] Package "${name}" does not exist on npm.`)
  }

  if (!version) {
    return
  }

  const isExactVersion = EXACT_VERSION_PATTERN.test(version)
  const isDistTag = DIST_TAG_PATTERN.test(version)
  if (!isExactVersion && !isDistTag) {
    return
  }

  const metadata: {
    versions?: Record<string, unknown>
    'dist-tags'?: Record<string, string>
  } = await response.json()

  const { versions = {}, 'dist-tags': distTags = {} } = metadata
  if (isExactVersion && !versions[version]) {
    throw new Error(
      `[renoun] Version "${version}" for package "${name}" does not exist on npm.`
    )
  }

  if (isDistTag && !distTags[version]) {
    throw new Error(
      `[renoun] Version "${version}" for package "${name}" does not exist on npm.`
    )
  }
}

async function validatePackages(variant: CommandVariant, subject: string) {
  if (variant !== 'install' && variant !== 'install-dev') {
    return
  }

  const tokens = subject.split(/\s+/).filter(Boolean)
  const specs = tokens
    .map(parsePackageSpec)
    .filter((spec): spec is PackageValidationResult => Boolean(spec))

  if (specs.length === 0) {
    return
  }

  await Promise.all(specs.map((spec) => validatePackage(spec)))
}

function buildCommand(
  packageManager: PackageManager,
  variant: CommandVariant,
  subject: string
): string {
  if (variant === 'install' || variant === 'install-dev') {
    const base = installBase[packageManager]
    const flag =
      variant === 'install-dev' ? installDevFlags[packageManager] : ''
    const body = [base, flag, subject].filter(Boolean).join(' ')
    return body
  }

  if (variant === 'run') {
    if (packageManager === 'npm') {
      const body = ['npm run', subject].filter(Boolean).join(' ')
      return body
    }
    if (packageManager === 'pnpm') {
      const body = ['pnpm', subject].filter(Boolean).join(' ')
      return body
    }
    if (packageManager === 'yarn') {
      const body = ['yarn', subject].filter(Boolean).join(' ')
      return body
    }
    const body = ['bun run', subject].filter(Boolean).join(' ')
    return body
  }

  if (variant === 'exec') {
    const runner =
      packageManager === 'npm'
        ? 'npx'
        : packageManager === 'pnpm'
          ? 'pnpm dlx'
          : packageManager === 'yarn'
            ? 'yarn dlx'
            : 'bunx'
    const body = [runner, subject].filter(Boolean).join(' ')
    return body
  }

  if (variant === 'create') {
    const runner =
      packageManager === 'npm'
        ? 'npm create'
        : packageManager === 'pnpm'
          ? 'pnpm create'
          : packageManager === 'yarn'
            ? 'yarn create'
            : 'bun create'
    const body = [runner, subject].filter(Boolean).join(' ')
    return body
  }

  return subject
}

export interface CommandProps {
  /** The type of command to render across package managers. */
  variant?: CommandVariant

  /** Content used as the subject: packages (install), script (run), binary (exec), or template (create). */
  children: React.ReactNode

  /** Whether the command should validate the npm package before rendering. */
  shouldValidate?: boolean

  /** Override styles for each part of the component. */
  css?: {
    container?: CSSObject
    tabs?: CSSObject
    tabButton?: CSSObject
    tabPanel?: CSSObject
    copyButton?: CSSObject
    code?: CSSObject
  }

  /** Override class names for each part of the component. */
  className?: {
    container?: string
    tabs?: string
    tabButton?: string
    tabPanel?: string
    copyButton?: string
    code?: string
  }

  /** Inline style overrides for each part of the component. */
  style?: {
    container?: React.CSSProperties
    tabs?: React.CSSProperties
    tabButton?: React.CSSProperties
    tabPanel?: React.CSSProperties
    copyButton?: React.CSSProperties
    code?: React.CSSProperties
  }
}

interface CommandAsyncProps extends Omit<CommandProps, 'children'> {
  id: string
  command: string
  variant: CommandVariant
}

const Container = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 5,
})

const Tabs = styled('div', {
  display: 'flex',
  alignItems: 'center',
})

const TabButton = styled('button', {
  fontSize: 'inherit',
  width: '8ch',
  padding: '0.4em 0.8em',
  lineHeight: 1.4,
  border: 'none',
  borderBottom: '1px solid transparent',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  '&[aria-selected="true"]': {
    fontWeight: 600,
    borderBottom: '1px solid #fff',
    color: '#fff',
  },
  ':focus': {
    outline: 'none',
  },
  ':focus-visible': {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    backgroundClip: 'content-box',
  },
})

const TabPanel = styled('pre', {
  lineHeight: '1.4',
  padding: '1ch',
  margin: 0,
  overflow: 'auto',
})

const Code = styled('code', {})

const StyledCopyCommand = styled(CopyCommand, {
  display: 'flex',
  marginLeft: 'auto',
})

function getChildrenText(children: React.ReactNode): string {
  const parts: string[] = []
  React.Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      parts.push(String(child))
    }
  })
  const text = parts.map((part) => part.trim()).join('')
  return text
}

/** Generic command renderer with a variant for each package manager. */
async function CommandAsync({
  id,
  variant,
  command: subject,
  shouldValidate,
  css,
  className,
  style,
}: CommandAsyncProps) {
  if (shouldValidate) {
    await validatePackages(variant, subject)
  }

  const config = await getConfig()
  const theme = await getThemeColors(config.theme)

  const tabs = (
    <Tabs
      role="tablist"
      aria-orientation="horizontal"
      data-command-group={id}
      css={{
        boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}`,
        ...css?.tabs,
      }}
      className={className?.tabs}
      style={style?.tabs}
    >
      {PACKAGE_MANAGERS.map((packageManager) => {
        return (
          <TabButton
            key={packageManager}
            role="tab"
            id={`${id}-${packageManager}-tab`}
            aria-controls={`${id}-${packageManager}-panel`}
            aria-selected={config.defaultPackageManager === packageManager}
            data-command={packageManager}
            data-command-group={id}
            css={{
              color: theme.activityBar.foreground,
              ...css?.tabButton,
            }}
            className={className?.tabButton}
            style={style?.tabButton}
            suppressHydrationWarning
          >
            {packageManager}
          </TabButton>
        )
      })}
      <StyledCopyCommand
        css={{
          marginRight: '1ch',
          backgroundColor: theme.activityBar.background,
          color: theme.activityBar.foreground,
          ...css?.copyButton,
        }}
        className={className?.copyButton}
        style={style?.copyButton}
      />
    </Tabs>
  )

  const tabPanels = PACKAGE_MANAGERS.map((packageManager) => {
    const commandText = buildCommand(packageManager, variant, subject)
    return (
      <TabPanel
        key={packageManager}
        role="tabpanel"
        id={`${id}-${packageManager}-panel`}
        hidden={config.defaultPackageManager !== packageManager}
        aria-labelledby={`${id}-${packageManager}-tab`}
        data-command={packageManager}
        data-command-tab-panel={commandText}
        data-command-group={id}
        css={css?.tabPanel}
        className={className?.tabPanel}
        style={style?.tabPanel}
        suppressHydrationWarning
      >
        <Code css={css?.code} className={className?.code} style={style?.code}>
          <Tokens language="sh" shouldFormat={false}>
            {commandText}
          </Tokens>
        </Code>
      </TabPanel>
    )
  })

  return (
    <Container
      data-command-group={id}
      css={{
        backgroundColor: theme.background,
        color: theme.foreground,
        boxShadow: `0 0 0 1px ${theme.panel.border}`,
        ...css?.container,
      }}
      className={className?.container}
      style={style?.container}
    >
      {tabs}
      {tabPanels}
      <CommandClient />
    </Container>
  )
}

/** Renders a terminal command with a variant for each package manager. */
export function Command({
  children,
  variant,
  css,
  className,
  style,
  shouldValidate = true,
}: CommandProps) {
  if (!variant) {
    return (
      <Code css={css?.code} className={className?.code} style={style?.code}>
        <Tokens language="sh" shouldFormat={false}>
          {String(children)}
        </Tokens>
      </Code>
    )
  }

  const id = useId()
  const command = getChildrenText(children)

  return (
    <CommandAsync
      id={id}
      command={command}
      variant={variant}
      css={css}
      className={className}
      style={style}
      shouldValidate={shouldValidate}
    />
  )
}
