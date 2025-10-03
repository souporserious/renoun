import React, { useId } from 'react'
import { css, type CSSObject } from 'restyle'

import {
  getThemeColors,
  getThemeTokenVariables,
} from '../../utils/get-theme.js'
import { getConfig } from '../Config/ServerConfigContext.js'
import { Code, type CodeComponents } from '../Code/index.js'
import { Tokens } from '../Code/Tokens.js'
import { CopyCommand } from './CopyCommand.js'
import { CommandClient } from './CommandClient.js'

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

const containerBaseStyles: CSSObject = {
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 5,
}

const tabsBaseStyles: CSSObject = {
  display: 'flex',
  alignItems: 'center',
}

const tabButtonBaseStyles: CSSObject = {
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
}

const tabPanelBaseStyles: CSSObject = {
  lineHeight: '1.4',
  padding: '1ch',
  margin: 0,
  overflow: 'auto',
}

const copyButtonBaseStyles: CSSObject = {
  display: 'flex',
  marginLeft: 'auto',
}

type Theme = Awaited<ReturnType<typeof getThemeColors>>
type ThemeTokens = ReturnType<typeof getThemeTokenVariables>
type InlineComponentsOverride = CodeComponents['Inline'] extends {
  components?: infer Inline
}
  ? Inline
  : never

interface CommandContainerProps {
  id: string
  className: string
  theme: Theme
  themeTokens: ThemeTokens
  children: React.ReactNode
}

interface CommandTabsProps {
  id: string
  className: string
  theme: Theme
  copyButton: React.ReactNode
  children: React.ReactNode
}

interface CommandTabButtonProps {
  id: string
  tabId: string
  panelId: string
  packageManager: PackageManager
  isSelected: boolean
  className: string
  theme: Theme
  children: React.ReactNode
}

interface CommandTabPanelProps {
  id: string
  tabId: string
  panelId: string
  packageManager: PackageManager
  command: string
  isSelected: boolean
  className: string
  theme: Theme
  children: React.ReactNode
}

interface CommandCopyButtonProps {
  id: string
  className: string
  theme: Theme
}

type CommandComponentOverrides = {
  Container?: React.ComponentType<CommandContainerProps>
  Tabs?: React.ComponentType<CommandTabsProps>
  TabButton?: React.ComponentType<CommandTabButtonProps>
  TabPanel?: React.ComponentType<CommandTabPanelProps>
  CopyButton?: React.ComponentType<CommandCopyButtonProps>
  Code?: InlineComponentsOverride
}

export interface CommandProps {
  /** The type of command to render across package managers. */
  variant?: CommandVariant

  /** Content used as the subject: packages (install), script (run), binary (exec), or template (create). */
  children: React.ReactNode

  /** Override internal sub-components with custom implementations. */
  components?: CommandComponentOverrides
}

interface CommandAsyncProps extends Omit<CommandProps, 'children'> {
  id: string
  command: string
  variant: CommandVariant
}

function DefaultContainer({ id, className, children }: CommandContainerProps) {
  return (
    <div data-command-group={id} className={className}>
      {children}
    </div>
  )
}

function DefaultTabs({
  id,
  className,
  copyButton,
  children,
}: CommandTabsProps) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      data-command-group={id}
      className={className}
    >
      {children}
      {copyButton}
    </div>
  )
}

function DefaultTabButton({
  id,
  tabId,
  panelId,
  packageManager,
  isSelected,
  className,
  children,
}: CommandTabButtonProps) {
  return (
    <button
      role="tab"
      id={tabId}
      aria-controls={panelId}
      aria-selected={isSelected}
      data-command={packageManager}
      data-command-group={id}
      className={className}
      suppressHydrationWarning
    >
      {children}
    </button>
  )
}

function DefaultTabPanel({
  id,
  tabId,
  panelId,
  packageManager,
  command,
  isSelected,
  className,
  children,
}: CommandTabPanelProps) {
  return (
    <pre
      role="tabpanel"
      id={panelId}
      hidden={!isSelected}
      aria-labelledby={tabId}
      data-command={packageManager}
      data-command-tab-panel={command}
      data-command-group={id}
      className={className}
      suppressHydrationWarning
    >
      {children}
    </pre>
  )
}

function DefaultCopyButton({ id, className }: CommandCopyButtonProps) {
  return <CopyCommand data-command-group={id} className={className} />
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

async function CommandAsync({
  id,
  variant,
  command: subject,
  components,
}: CommandAsyncProps) {
  const config = await getConfig()
  const theme = await getThemeColors(config.theme)
  const themeTokens = getThemeTokenVariables(config.theme)

  const [containerClassName, ContainerStyles] = css({
    ...containerBaseStyles,
    backgroundColor: theme.background,
    color: theme.foreground,
    boxShadow: `0 0 0 1px ${theme.panel.border}`,
    ...themeTokens,
  })
  const [tabsClassName, TabsStyles] = css({
    ...tabsBaseStyles,
    boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}`,
  })
  const [tabButtonClassName, TabButtonStyles] = css({
    ...tabButtonBaseStyles,
    color: theme.activityBar.foreground,
  })
  const [tabPanelClassName, TabPanelStyles] = css(tabPanelBaseStyles)
  const [copyButtonClassName, CopyButtonStyles] = css({
    ...copyButtonBaseStyles,
    marginRight: '1ch',
    backgroundColor: theme.activityBar.background,
    color: theme.activityBar.foreground,
  })

  const ContainerComponent = components?.Container ?? DefaultContainer
  const TabsComponent = components?.Tabs ?? DefaultTabs
  const TabButtonComponent = components?.TabButton ?? DefaultTabButton
  const TabPanelComponent = components?.TabPanel ?? DefaultTabPanel
  const CopyButtonComponent = components?.CopyButton ?? DefaultCopyButton
  const inlineComponents = components?.Code

  const tabs = (
    <TabsComponent
      id={id}
      className={tabsClassName}
      theme={theme}
      copyButton={
        <CopyButtonComponent
          id={id}
          className={copyButtonClassName}
          theme={theme}
        />
      }
    >
      {PACKAGE_MANAGERS.map((packageManager) => {
        const tabId = `${id}-${packageManager}-tab`
        const panelId = `${id}-${packageManager}-panel`
        const isSelected = config.defaultPackageManager === packageManager

        return (
          <TabButtonComponent
            key={packageManager}
            id={id}
            tabId={tabId}
            panelId={panelId}
            packageManager={packageManager}
            isSelected={isSelected}
            className={tabButtonClassName}
            theme={theme}
          >
            {packageManager}
          </TabButtonComponent>
        )
      })}
    </TabsComponent>
  )

  const tabPanels = PACKAGE_MANAGERS.map((packageManager) => {
    const tabId = `${id}-${packageManager}-tab`
    const panelId = `${id}-${packageManager}-panel`
    const commandText = buildCommand(packageManager, variant, subject)
    const isSelected = config.defaultPackageManager === packageManager

    return (
      <TabPanelComponent
        key={packageManager}
        id={id}
        tabId={tabId}
        panelId={panelId}
        packageManager={packageManager}
        command={commandText}
        isSelected={isSelected}
        className={tabPanelClassName}
        theme={theme}
      >
        <Code components={inlineComponents}>
          <Tokens language="sh">{commandText}</Tokens>
        </Code>
      </TabPanelComponent>
    )
  })

  return (
    <>
      <ContainerStyles />
      <TabsStyles />
      <TabButtonStyles />
      <TabPanelStyles />
      <CopyButtonStyles />
      <ContainerComponent
        id={id}
        className={containerClassName}
        theme={theme}
        themeTokens={themeTokens}
      >
        {tabs}
        {tabPanels}
        <CommandClient />
      </ContainerComponent>
    </>
  )
}

/** Renders a terminal command with a variant for each package manager. */
export function Command({ children, variant, components }: CommandProps) {
  if (!variant) {
    return (
      <Code components={components?.Code}>
        <Tokens language="sh">{String(children)}</Tokens>
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
      components={components}
    />
  )
}

export type CommandComponents = {
  Container: CommandContainerProps
  Tabs: CommandTabsProps
  TabButton: CommandTabButtonProps
  TabPanel: CommandTabPanelProps
  CopyButton: CommandCopyButtonProps
  Code: InlineComponentsOverride
}
