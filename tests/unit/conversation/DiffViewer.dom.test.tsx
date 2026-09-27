/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import styles from '@/renderer/pages/conversation/Preview/components/viewers/DiffViewer/DiffViewer.module.css';

/** CSS modules hash `.diffRoot` at build time. Mirror that so jsdom can apply the real rules. */
const darkCss = readFileSync(
  path.resolve(
    'packages/desktop/src/renderer/pages/conversation/Preview/components/viewers/DiffViewer/DiffViewer.module.css'
  ),
  'utf8'
)
  .replaceAll('.diffRoot', `.${styles.diffRoot}`)
  .replace(/:global\(([^)]+)\)/g, '$1');

vi.mock('@arco-design/web-react', () => ({
  Checkbox: ({
    children,
    checked,
    onChange,
    className,
  }: {
    children?: React.ReactNode;
    checked?: boolean;
    onChange?: (value: boolean) => void;
    className?: string;
  }) => (
    <label className={className}>
      <input type='checkbox' checked={checked} onChange={(event) => onChange?.(event.target.checked)} />
      {children}
    </label>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview/components/renderers/SelectionToolbar', () => ({
  default: () => null,
}));

import DiffPreview from '@/renderer/pages/conversation/Preview/components/viewers/DiffViewer';

const SAMPLE_DIFF = `diff --git a/hello.txt b/hello.txt
index 1111111..2222222 100644
--- a/hello.txt
+++ b/hello.txt
@@ -1 +1 @@
-hello
+hello world
`;

function renderDiff(content: string): HTMLElement {
  const view = render(<DiffPreview content={content} />);
  return view.container;
}

describe('DiffViewer dark theme', () => {
  beforeEach(() => {
    document.head.querySelector('[data-testid="diff-viewer-dark-css"]')?.remove();
    const style = document.createElement('style');
    style.dataset.testid = 'diff-viewer-dark-css';
    style.textContent = darkCss;
    document.head.appendChild(style);
    document.documentElement.style.setProperty('--bg-1', '#1a1a1a');
    document.documentElement.style.setProperty('--bg-2', '#262626');
    document.documentElement.style.setProperty('--bg-3', '#333333');
    document.documentElement.style.setProperty('--text-primary', '#ffffff');
    document.documentElement.style.setProperty('--text-secondary', '#ced3da');
  });

  it('applies dark diff colors when the document theme is dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const container = renderDiff(SAMPLE_DIFF);
    const diffRoot = container.querySelector('.d2h-dark-color-scheme');
    const fileName = diffRoot?.querySelector('.d2h-file-name');
    const insertedLine = diffRoot?.querySelector('.d2h-ins .d2h-code-line');

    expect(fileName).not.toBeNull();
    expect(window.getComputedStyle(fileName as Element).color).toBe('var(--text-primary)');
    expect(window.getComputedStyle(insertedLine as Element).backgroundColor).toMatch(/rgba\(35,\s*195,\s*67/);
  });

  it('leaves stock diff colors in place when the theme is light', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const container = renderDiff(SAMPLE_DIFF);
    const fileName = container.querySelector('.d2h-file-name');

    expect(container.querySelector('.d2h-dark-color-scheme')).toBeNull();
    expect(fileName).not.toBeNull();
    expect(window.getComputedStyle(fileName as Element).color).not.toBe('var(--text-primary)');
  });

  it('keeps the side-by-side label when the diff is empty', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    renderDiff('');

    expect(screen.getAllByText('preview.sideBySideLabel').length).toBeGreaterThan(0);
    expect(screen.queryByText('side-by-side')).not.toBeInTheDocument();
  });

  it('switches to side-by-side markup when the toggle is checked', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const container = renderDiff(SAMPLE_DIFF);
    const toggles = screen.getAllByRole('checkbox');

    fireEvent.click(toggles[0]);

    expect(container.querySelector('.d2h-code-side-line')).not.toBeNull();
    expect(container.querySelector('.d2h-files-diff')).not.toBeNull();
  });
});
