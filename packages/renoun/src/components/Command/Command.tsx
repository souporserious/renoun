import React, { useId } from 'react'
import { styled, type CSSObject } from 'restyle'

import {
  getThemeColors,
  getThemeTokenVariables,
} from '../../utils/get-theme.js'
import { getConfig } from '../Config/ServerConfigContext.js'
import { Tokens } from '../CodeBlock/Tokens.js'
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

export interface CommandProps {
  /** The type of command to render across package managers. */
  variant?: CommandVariant

  /** Content used as the subject: packages (install), script (run), binary (exec), or template (create). */
  children: React.ReactNode

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
  '&.selected': {
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
  display: 'none',
  '&.selected': {
    display: 'block',
  },
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
  css,
  className,
  style,
}: CommandAsyncProps) {
  const config = getConfig()
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
          <Tokens language="sh">{commandText}</Tokens>
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
        ...getThemeTokenVariables(config.theme),
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
}: CommandProps) {
  if (!variant) {
    return (
      <Code css={css?.code} className={className?.code} style={style?.code}>
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
      css={css}
      className={className}
      style={style}
    />
  )
}
