import React from 'react'
import { styled, type CSSObject } from 'restyle'

import { getThemeColors } from '../../utils/get-theme-colors.js'
import { CodeBlock } from '../CodeBlock/CodeBlock.js'
import { Tokens } from '../CodeBlock/Tokens.js'
import { CopyCommand } from './CopyCommand.js'
import { PackageInstallClient } from './PackageInstallClient.js'

const stateKey = 'package-manager'
const defaultPackageManager = 'npm'
const packageManagers = {
  npm: 'npm install',
  pnpm: 'pnpm add',
  bun: 'bun add',
  yarn: 'yarn add',
} as const

interface PackageInstallProps {
  /** The package names to install. */
  packages: string[]

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

/** Renders a package install command with a variant for each package manager. */
async function PackageInstallAsync({
  packages,
  css,
  className,
}: PackageInstallProps) {
  const theme = await getThemeColors()

  const tabs = (
    <Tabs
      role="tablist"
      aria-orientation="horizontal"
      css={{
        boxShadow: `inset 0 -1px 0 0 ${theme.panel.border}`,
        ...css?.tabs,
      }}
      className={className?.tabs}
    >
      {Object.keys(packageManagers).map((packageManager) => (
        <TabButton
          key={packageManager}
          role="tab"
          id={packageManager}
          aria-controls={`${packageManager}-panel`}
          data-storage-id={`package-manager-${packageManager}`}
          css={{
            color: theme.activityBar.foreground,
            ...css?.tabButton,
          }}
          className={className?.tabButton}
          suppressHydrationWarning
        >
          {packageManager}
        </TabButton>
      ))}
      <StyledCopyCommand
        css={{
          marginRight: '1ch',
          backgroundColor: theme.activityBar.background,
          color: theme.activityBar.foreground,
          ...css?.copyButton,
        }}
        className={className?.copyButton}
      />
    </Tabs>
  )

  const tabPanels = Object.entries(packageManagers).map(
    ([packageManager, install]) => {
      const installCommand = `${install} ${packages.join(' ')}`

      return (
        <TabPanel
          key={packageManager}
          role="tabpanel"
          id={`${packageManager}-panel`}
          aria-labelledby={packageManager}
          data-package-install-tab-panel={installCommand}
          data-storage-id={`package-manager-${packageManager}`}
          css={css?.tabPanel}
          className={className?.tabPanel}
          suppressHydrationWarning
        >
          <Code css={css?.code} className={className?.code}>
            <CodeBlock value={installCommand} language="sh">
              <Tokens />
            </CodeBlock>
          </Code>
        </TabPanel>
      )
    }
  )

  const children = []

  if (process.env.NODE_ENV === 'development') {
    children.push(
      import('./InstallWarning.js').then(({ InstallWarning }) => (
        <InstallWarning />
      ))
    )
  }

  return (
    <Container
      data-package-install=""
      css={{
        backgroundColor: theme.background,
        color: theme.foreground,
        boxShadow: `0 0 0 1px ${theme.panel.border}`,
        ...css?.container,
      }}
      className={className?.container}
    >
      {tabs}
      {tabPanels}
      {children}
      <PackageInstallClient />
    </Container>
  )
}

/** Renders a package install command with a variant for each package manager. */
export function PackageInstall({
  packages,
  css,
  className,
}: PackageInstallProps) {
  return (
    <PackageInstallAsync packages={packages} css={css} className={className} />
  )
}

declare global {
  interface Window {
    setPackageManager: (packageManager?: string) => void
  }
}

if (typeof window !== 'undefined') {
  window.setPackageManager()
}

const packageScript = `
window.setPackageManager = (packageManager) => {
  const shouldFocus = Boolean(packageManager);

  if (!packageManager) {
    packageManager = localStorage.getItem('${stateKey}') ?? '${defaultPackageManager}';
  }

  const tabs = document.querySelectorAll('[data-storage-id^="package-manager-"]');
  tabs.forEach((element, index) => {
    const isSelected = element.dataset.storageId === \`package-manager-\${packageManager}\`;
    const isTab = element.getAttribute('role') === 'tab';
    const isTabPanel = element.getAttribute('role') === 'tabpanel';
    
    if (isTab) {
      element.tabIndex = isSelected ? 0 : -1;
      element.setAttribute('aria-selected', isSelected);
      if (shouldFocus && isSelected) {
        element.focus();
      }
    }

    if (isTab || isTabPanel) {
      element.classList.toggle('selected', isSelected);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  window.setPackageManager();

  const tabs = document.querySelectorAll('[data-package-install] [role="tab"]');
  
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (event) => {
      const currentIndex = Array.from(tabs).indexOf(document.activeElement);
      let newIndex = null;

      switch (event.key) {
        case 'ArrowRight':
          newIndex = (currentIndex + 1) % tabs.length;
          break;
      
        case 'ArrowLeft':
          newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        
        case 'Home':
          newIndex = 0;
          break;
        
        case 'End':
          newIndex = tabs.length - 1;
          break;
      }

      if (newIndex === null) {
        return;
      }
      
      tabs[newIndex].click();
      event.preventDefault();
    });
  });
});

document.addEventListener('click', event => {
  const storageId = event.target.dataset.storageId;
  if (storageId?.startsWith('package-manager-')) {
    const command = storageId.replace('package-manager-', '');
    localStorage.setItem('${stateKey}', command);
    window.setPackageManager(command);
  }
});
`.trim()

/** Client script to set the package manager based on local storage if available. */
export function PackageInstallScript() {
  return (
    <script
      id="package-install-script"
      dangerouslySetInnerHTML={{ __html: packageScript }}
    />
  )
}
