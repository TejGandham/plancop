import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: [
      'src/**/*.test.ts',
      'server/**/*.test.ts',
      'mcp/**/*.test.ts',
      'test/**/*.test.ts',
      'ui/src/**/*.test.ts',
      'ui/src/**/*.test.tsx'
    ],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: [
        'server/mode.ts',
        'server/config.ts',
        'server/session.ts',
        'server/enrichment.ts',
        'server/hook.ts',
        'server/storage-versions.ts',
        'src/types/hook.ts',
        'ui/src/utils/feedback.ts',
        'ui/src/utils/parser.ts',
        'ui/src/utils/annotationHelpers.ts',
        'ui/src/utils/planDiffEngine.ts',
        'ui/src/components/ToolView.tsx',
        'ui/src/components/EditToolView.tsx',
        'ui/src/components/CreateToolView.tsx',
        'ui/src/components/BashToolView.tsx'
      ],
      exclude: ['node_modules', 'dist', '**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90
      },
      reporter: ['text', 'text-summary', 'json-summary']
    }
  }
})
