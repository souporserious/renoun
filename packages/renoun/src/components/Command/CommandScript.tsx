import React from 'react'

/**
 * The package manager.
 * @internal
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

const packageManagers: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun']

/**
 * The props for the `CommandScript` component.
 * @internal
 */
export interface CommandScriptProps {
  /** Override the default package manager used when none is stored. */
  defaultPackageManager?: PackageManager

  /** The nonce to use for the script tag. */
  nonce?: string
}

/**
 * Global script for the `Command` component. Defines a `window.setPackageManager`
 * method that wires up keyboard and click handlers, and applies a selection state.
 * @internal
 */
export function CommandScript({
  defaultPackageManager = 'npm',
  nonce,
}: CommandScriptProps) {
  const stateKey = 'package-manager'
  const installScriptSource = `
  window.setPackageManager = (packageManager) => {
    if (!packageManager) {
      packageManager = localStorage.getItem('${String(stateKey)}') ?? '${String(defaultPackageManager)}';
    }

    // Apply selection across ALL Command instances
    const elements = document.querySelectorAll('[data-command][role="tab"], [data-command][role="tabpanel"]');
    elements.forEach((element) => {
      const isSelected = element.dataset.command === packageManager;
      const isTab = element.getAttribute('role') === 'tab';
      const isTabPanel = element.getAttribute('role') === 'tabpanel';
      if (isTab) {
        element.tabIndex = isSelected ? 0 : -1;
        element.setAttribute('aria-selected', String(isSelected));
      }
      if (isTab || isTabPanel) {
        element.classList.toggle('selected', isSelected);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Attach keyboard handlers scoped per group, but update selection globally
    const containers = document.querySelectorAll('[data-command-group]');
    const groups = Array.from(new Set(Array.from(containers).map(el => el.getAttribute('data-command-group')).filter(Boolean)));

    groups.forEach((group) => {
      const tabs = document.querySelectorAll('[data-command-group="' + group + '"][data-command][role="tab"]');
      tabs.forEach((tab) => {
        tab.addEventListener('keydown', (event) => {
          const tabsInGroup = document.querySelectorAll('[data-command-group="' + group + '"][data-command][role="tab"]');
          const arr = Array.from(tabsInGroup);
          const currentIndex = arr.indexOf(document.activeElement);
          let newIndex = null;
          switch (event.key) {
            case 'ArrowRight':
              newIndex = (currentIndex + 1) % arr.length;
              break;
            case 'ArrowLeft':
              newIndex = (currentIndex - 1 + arr.length) % arr.length;
              break;
            case 'Home':
              newIndex = 0;
              break;
            case 'End':
              newIndex = arr.length - 1;
              break;
          }
          if (newIndex === null) return;
          arr[newIndex].click();
          event.preventDefault();
        });
      });
    });

    // Initialize selection across all instances from stored preference
    window.setPackageManager(null);
  });

  const commands = [${packageManagers.map((manager) => `"${manager}"`).join(',')}];
  document.addEventListener('click', event => {
    const target = event.target && event.target.closest ? event.target.closest('[data-command][role="tab"]') : null;
    if (!target) return;
    const command = target.dataset.command;
    if (!commands.includes(command)) return;
    localStorage.setItem('${String(stateKey)}', command);
    window.setPackageManager(command);
  });
  `.trim()
  const source = `data:text/javascript;base64,${btoa(installScriptSource)}`

  return <script async nonce={nonce} src={source} />
}
