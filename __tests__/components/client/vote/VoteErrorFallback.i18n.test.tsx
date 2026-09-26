import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/languageStore', () => {
  const dict: Record<string, string> = { vote_error_general: 'An error occurred. Please try again.', button_retry: 'Try Again' };
  const state = { currentLanguage: 'en', t: (k: string) => dict[k] ?? k };
  const useLanguageStore: any = (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state);
  return { useLanguageStore };
});

import { VoteErrorFallback } from '@/components/client/vote/common/VoteErrorFallback';

describe('VoteErrorFallback — 번역·원시 오류 비노출', () => {
  it('번역된 문구와 재시도 버튼을 보여주고 원시 오류 메시지는 노출하지 않는다', () => {
    render(<VoteErrorFallback error={new Error('PGRST500 internal detail')} resetErrorBoundary={vi.fn()} />);
    expect(screen.getByText('An error occurred. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('PGRST500');
  });
});
