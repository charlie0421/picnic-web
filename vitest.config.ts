import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.test.{ts,tsx}', '**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'json-summary'],
      include: [
        // Utils - fully tested
        'utils/transform.ts',
        'utils/star-candy-bonus.ts',
        'utils/auth-helpers.ts',
        'utils/auth-redirect-validators.ts',
        'utils/auth-redirect-storage.ts',
        'utils/storage.ts',
        'utils/debug.ts',
        'utils/enums.ts',
        'utils/date.ts',
        'utils/date/**/*.ts',
        'utils/retry.ts',
        'utils/retry-core.ts',
        'utils/retry-types.ts',
        'utils/retry-wrappers.ts',
        'utils/image-utils.ts',
        'utils/image/**/*.ts',
        'utils/logger.ts',
        'utils/logger-types.ts',
        'utils/logger-utils.ts',
        'utils/logger-targets.ts',
        'utils/error/**/*.ts',
        'utils/api/**/*.ts',
        // Lib
        'lib/utils.ts',
        'lib/supabase/transforms.ts',
        'lib/data-fetching/client/**/*.ts',
        // Hooks
        'hooks/useDebounce.ts',
        'hooks/useRetryableQuery.ts',
        'hooks/retryable-query-types.ts',
        'hooks/retryable-query-presets.ts',
        // Stores
        'stores/goonghapStore.ts',
        'stores/voteFilterStore.ts',
        // Contexts
        'contexts/error-context-reducer.ts',
        'contexts/ErrorContext.tsx',
        'contexts/NavigationContext.tsx',
        'contexts/GlobalLoadingContext.tsx',
        // Components - common atoms/molecules
        'components/common/atoms/**/*.tsx',
        'components/common/molecules/**/*.tsx',
        'components/common/DefaultErrorFallback.tsx',
        // Components - UI
        'components/ui/Dialog/**/*.tsx',
        'components/ui/LoadingSpinner.tsx',
        'components/ui/SafeAvatar.tsx',
        // Components - client
        'components/client/RetryButton.tsx',
        'components/client/vote/common/**/*.{ts,tsx}',
        'components/client/vote/list/VoteCard.tsx',
        'components/client/vote/list/vote-card-utils.ts',
        'components/client/vote/list/VoteEmptyState.tsx',
        'components/client/vote/list/VoteLoadingSkeleton.tsx',
        'components/client/star-candy/star-candy-utils.ts',
        // Components - server states
        'components/server/ErrorState.tsx',
        'components/server/LoadingState.tsx',
        'components/server/NotFoundState.tsx',
      ],
      exclude: [
        '**/*.d.ts',
        '**/types.ts',
        '**/index.ts',
        '**/__tests__/**',
        'components/client/vote/common/GridViewDemo.tsx',
        'components/client/vote/common/VoteRankCardAnimated.tsx',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
