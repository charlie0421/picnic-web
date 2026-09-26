import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QnaThreadWithRelations } from '@/app/[lang]/(mypage)/mypage/qna/[thread_id]/qna-utils';

const mocks = vi.hoisted(() => ({
  createBrowserSupabaseClient: vi.fn(),
  useQnaForm: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useOptimistic: <State,>(state: State) => [state, vi.fn()],
  };
});
vi.mock(
  '@/app/[lang]/(mypage)/mypage/qna/[thread_id]/useQnaForm',
  () => ({ useQnaForm: mocks.useQnaForm }),
);
vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: mocks.createBrowserSupabaseClient,
}));
vi.mock('@/hooks/useTranslations', () => ({
  useTranslations: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    tDynamic: (key: string) => key,
  }),
}));
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ currentLanguage: 'ko' }),
}));
vi.mock(
  '@/app/[lang]/(mypage)/mypage/qna/[thread_id]/QnaMessageList',
  () => ({ default: () => null }),
);
vi.mock(
  '@/app/[lang]/(mypage)/mypage/qna/[thread_id]/QnaMediaModal',
  () => ({ default: () => null }),
);

import QnaDetailClient from '@/app/[lang]/(mypage)/mypage/qna/[thread_id]/QnaDetailClient';

const THREAD: QnaThreadWithRelations = {
  category_code: null,
  created_at: '2026-09-26T00:00:00.000Z',
  id: 1,
  status: 'RECEIVED',
  title: 'Attachment issue',
  updated_at: '2026-09-26T00:00:00.000Z',
  user_id: 'user-1',
  qna_messages: [],
};

describe('QnaDetailClient attachment form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    const channel = {
      on: vi.fn(),
      subscribe: vi.fn(),
    };
    channel.on.mockReturnValue(channel);
    channel.subscribe.mockReturnValue(channel);
    mocks.createBrowserSupabaseClient.mockReturnValue({
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    });
    mocks.useQnaForm.mockReturnValue({
      attachments: [],
      previewUrls: [],
      isSubmitting: false,
      submitError: 'Unsupported attachment type.',
      fileInputRef: { current: null },
      formRef: { current: null },
      handleFileChange: vi.fn(),
      removeAttachment: vi.fn(),
      handleSubmit: vi.fn(),
      clearAll: vi.fn(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ success: false }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the submission error and limits selection to server-supported MIME types', () => {
    const { container } = render(<QnaDetailClient thread={THREAD} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unsupported attachment type.',
    );
    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      'image/jpeg,image/jpg,image/png,image/gif,image/webp,image/avif,video/mp4,video/quicktime',
    );
  });
});
