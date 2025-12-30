import React, { useId } from 'react'
import { styled, type CSSObject } from 'restyle'

import { getThemeColors } from '../../utils/get-theme.ts'
import { getConfig } from '../Config/ServerConfigContext.tsx'
import { Tokens } from '../CodeBlock/Tokens.ts'
import {
  normalizeSlotComponents,
  type SlotComponentOrProps,
} from '../../utils/slot-components.ts'
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

  /** Override the components and/or props for each slot. */
  components?: Partial<CommandComponentOverrides>
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

type ContainerProps = React.ComponentProps<'div'> & { css?: CSSObject }
type TabsProps = React.ComponentProps<'div'> & { css?: CSSObject }
type TabButtonProps = React.ComponentProps<'button'> & { css?: CSSObject }
type TabPanelProps = React.ComponentProps<'pre'> & { css?: CSSObject }
type CodeProps = React.ComponentProps<'code'> & { css?: CSSObject }
type CopyButtonProps = React.ComponentProps<typeof CopyCommand>

export type CommandComponents = {
  Container: React.ComponentType<ContainerProps>
  Tabs: React.ComponentType<TabsProps>
  TabButton: React.ComponentType<TabButtonProps>
  TabPanel: React.ComponentType<TabPanelProps>
  CopyButton: React.ComponentType<CopyButtonProps>
  Code: React.ComponentType<CodeProps>
}

export type CommandComponentOverrides = {
  Container: SlotComponentOrProps<ContainerProps>
  Tabs: SlotComponentOrProps<TabsProps>
  TabButton: SlotComponentOrProps<TabButtonProps>
  TabPanel: SlotComponentOrProps<TabPanelProps>
  CopyButton: SlotComponentOrProps<CopyButtonProps>
  Code: SlotComponentOrProps<CodeProps>
}

function normalizeComponents(
  overrides: Partial<CommandComponentOverrides> | undefined
): CommandComponents {
  const defaultComponents: CommandComponents = {
    Container,
    Tabs,
    TabButton,
    TabPanel,
    CopyButton: StyledCopyCommand,
    Code,
  }

  return normalizeSlotComponents(defaultComponents, overrides as any)
}

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
  components: componentsProp,
}: CommandAsyncProps) {
  if (shouldValidate) {
    await validatePackages(variant, subject)
  }

  const config = await getConfig()
  const theme = await getThemeColors(config.theme)

  const components = normalizeComponents(componentsProp)
  const {
    Container: ContainerComponent,
    Tabs: TabsComponent,
    TabButton: TabButtonComponent,
    TabPanel: TabPanelComponent,
    CopyButton: CopyButtonComponent,
    Code: CodeComponent,
  } = components

  const tabs = (
    <TabsComponent
      role="tablist"
      aria-orientation="horizontal"
      data-command-group={id}
      css={{
        boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}`,
      }}
    >
      {PACKAGE_MANAGERS.map((packageManager) => {
        return (
          <TabButtonComponent
            key={packageManager}
            role="tab"
            id={`${id}-${packageManager}-tab`}
            aria-controls={`${id}-${packageManager}-panel`}
            aria-selected={config.defaultPackageManager === packageManager}
            data-command={packageManager}
            data-command-group={id}
            css={{
              color: theme.activityBar.foreground,
            }}
            suppressHydrationWarning
          >
            {packageManager}
          </TabButtonComponent>
        )
      })}
      <CopyButtonComponent
        css={{
          marginRight: '1ch',
          backgroundColor: theme.activityBar.background,
          color: theme.activityBar.foreground,
        }}
      />
    </TabsComponent>
  )

  const tabPanels = PACKAGE_MANAGERS.map((packageManager) => {
    const commandText = buildCommand(packageManager, variant, subject)
    return (
      <TabPanelComponent
        key={packageManager}
        role="tabpanel"
        id={`${id}-${packageManager}-panel`}
        hidden={config.defaultPackageManager !== packageManager}
        aria-labelledby={`${id}-${packageManager}-tab`}
        data-command={packageManager}
        data-command-tab-panel={commandText}
        data-command-group={id}
        suppressHydrationWarning
      >
        <CodeComponent>
          <Tokens language="shell" path={null} shouldFormat={false}>
            {commandText}
          </Tokens>
        </CodeComponent>
      </TabPanelComponent>
    )
  })

  return (
    <ContainerComponent
      data-command-group={id}
      css={{
        backgroundColor: theme.background,
        color: theme.foreground,
        boxShadow: `0 0 0 1px ${theme.panel.border}`,
      }}
    >
      {tabs}
      {tabPanels}
      <CommandClient />
    </ContainerComponent>
  )
}

/** Renders a terminal command with a variant for each package manager. */
export function Command({
  children,
  variant,
  components: componentsProp,
  shouldValidate = true,
}: CommandProps) {
  const components = normalizeComponents(componentsProp)
  const { Code: CodeComponent } = components

  if (!variant) {
    return (
      <CodeComponent>
        <Tokens language="shell" path={null} shouldFormat={false}>
          {String(children)}
        </Tokens>
      </CodeComponent>
    )
  }

  const id = useId()
  const command = getChildrenText(children)

  return (
    <CommandAsync
      id={id}
      command={command}
      variant={variant}
      components={componentsProp}
      shouldValidate={shouldValidate}
    />
  )
}
