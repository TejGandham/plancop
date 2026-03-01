import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolView } from '../ToolView';
import { EditToolView } from '../EditToolView';
import { CreateToolView } from '../CreateToolView';
import { BashToolView } from '../BashToolView';

describe('EditToolView', () => {
  it('renders the file path prominently', () => {
    const html = renderToStaticMarkup(
      <EditToolView
        toolArgs={{
          file: 'src/App.tsx',
          old_string: 'const a = 1;',
          new_string: 'const a = 2;',
          language: 'tsx',
        }}
      />
    );

    expect(html).toContain('src/App.tsx');
    expect(html).toContain('EDIT');
  });

  it('renders removed and added diff lines with red/green styling', () => {
    const html = renderToStaticMarkup(
      <EditToolView
        toolArgs={{
          file: 'src/App.tsx',
          old_string: 'const value = 1;',
          new_string: 'const value = 2;',
          language: 'tsx',
        }}
      />
    );

    expect(html).toContain('bg-red-500/10');
    expect(html).toContain('text-red-400');
    expect(html).toContain('bg-green-500/10');
    expect(html).toContain('text-green-400');
    expect(html).toContain('- const value = 1;');
    expect(html).toContain('+ const value = 2;');
  });

  it('renders line numbers for both old and new content', () => {
    const html = renderToStaticMarkup(
      <EditToolView
        toolArgs={{
          file: 'src/App.tsx',
          old_string: 'line one\nline two',
          new_string: 'line one\nline two updated',
          language: 'tsx',
        }}
      />
    );

    expect(html).toContain('data-old-line="1"');
    expect(html).toContain('data-new-line="1"');
    expect(html).toContain('data-old-line="2"');
    expect(html).toContain('data-new-line="2"');
  });
});

describe('CreateToolView', () => {
  it('renders file path with NEW FILE badge', () => {
    const html = renderToStaticMarkup(
      <CreateToolView
        toolArgs={{
          file: 'src/new-file.ts',
          content: 'export const hello = 1;',
          language: 'typescript',
        }}
      />
    );

    expect(html).toContain('src/new-file.ts');
    expect(html).toContain('NEW FILE');
  });

  it('renders content with language label and line numbers', () => {
    const html = renderToStaticMarkup(
      <CreateToolView
        toolArgs={{
          file: 'src/new-file.ts',
          content: 'export const hello = 1;\nexport const world = 2;',
          language: 'typescript',
        }}
      />
    );

    expect(html).toContain('typescript');
    expect(html).toContain('export const hello = 1;');
    expect(html).toContain('export const world = 2;');
    expect(html).toContain('data-line="1"');
    expect(html).toContain('data-line="2"');
  });
});

describe('BashToolView', () => {
  it('renders warning banner and command block', () => {
    const html = renderToStaticMarkup(
      <BashToolView toolArgs={{ command: 'npm run build' }} />
    );

    expect(html).toContain('This bash command will be executed');
    expect(html).toContain('npm run build');
    expect(html).toContain('bg-zinc-900');
    expect(html).toContain('text-green-400');
  });

  it('shows DANGER badge for risky commands', () => {
    const html = renderToStaticMarkup(
      <BashToolView toolArgs={{ command: 'rm -rf node_modules' }} />
    );

    expect(html).toContain('DANGER');
  });

  it('does not show DANGER badge for safe commands', () => {
    const html = renderToStaticMarkup(
      <BashToolView toolArgs={{ command: 'npm test' }} />
    );

    expect(html).not.toContain('DANGER');
  });
});

describe('ToolView dispatcher', () => {
  it('dispatches to edit view for edit tool', () => {
    const html = renderToStaticMarkup(
      <ToolView
        toolName="edit"
        toolArgs={{ file: 'src/a.ts', old_string: 'a', new_string: 'b', language: 'typescript' }}
      />
    );

    expect(html).toContain('EDIT');
    expect(html).toContain('src/a.ts');
  });

  it('dispatches to create view for write tool', () => {
    const html = renderToStaticMarkup(
      <ToolView
        toolName="write"
        toolArgs={{ file: 'src/new.ts', content: 'const x = 1;', language: 'typescript' }}
      />
    );

    expect(html).toContain('NEW FILE');
    expect(html).toContain('src/new.ts');
  });

  it('falls back to JSON for unknown tools', () => {
    const html = renderToStaticMarkup(
      <ToolView
        toolName="unknown-tool"
        toolArgs={{ foo: 'bar', count: 2 }}
      />
    );

    expect(html).toContain('unknown-tool');
    expect(html).toContain('&quot;foo&quot;');
    expect(html).toContain('&quot;bar&quot;');
  });
});
