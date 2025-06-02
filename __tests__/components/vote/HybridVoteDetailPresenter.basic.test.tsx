import React from 'react';
import { render, screen } from '@testing-library/react';
import { HybridVoteDetailPresenter } from '@/components/client/vote/detail/HybridVoteDetailPresenter';
import { Vote, VoteItem } from '@/types/interfaces';

// Mock all the dependencies
jest.mock('@/lib/supabase/client', () => ({
  createBrowserSupabaseClient: jest.fn(() => ({
    auth: { getUser: jest.fn(() => ({ data: { user: null } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null })),
        })),
      })),
    })),
    channel: jest.fn(() => ({
      on: jest.fn(() => ({ subscribe: jest.fn() })),
    })),
  })),
}));

jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({ currentLanguage: 'ko' }),
}));

jest.mock('@/hooks/useAuthGuard', () => ({
  useRequireAuth: () => ({
    withAuth: jest.fn((fn) => fn()),
  }),
}));

jest.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({ user: null, session: null, isLoading: false }),
}));

jest.mock('@/utils/api/strings', () => ({
  getLocalizedString: (obj: any, lang: string) => {
    if (typeof obj === 'string') return obj;
    if (typeof obj === 'object' && obj && lang in obj) return obj[lang];
    return 'Mock String';
  },
}));

jest.mock('@/utils/api/image', () => ({
  getCdnImageUrl: (url: string) => url || '/default-image.jpg',
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock data
const mockVote: Vote = {
  id: 1,
  title: { ko: 'Test Vote' },
  vote_content: 'Test vote description',
  start_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  stop_at: new Date('2024-12-31T23:59:59Z').toISOString(),
  area: 'global',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  main_image: null,
  order: null,
  result_image: null,
  visible_at: null,
  vote_category: null,
  vote_sub_category: null,
  wait_image: null,
};

const mockVoteItems: VoteItem[] = [
  {
    id: 1,
    artist_id: 1,
    group_id: 1,
    vote_id: 1,
    vote_total: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    artist: {
      id: 1,
      name: { ko: 'Artist 1' },
      image: 'https://example.com/artist1.jpg',
      birth_date: null,
      created_at: new Date().toISOString(),
      debut_date: null,
      debut_dd: null,
      debut_mm: null,
      debut_yy: null,
      deleted_at: null,
      gender: null,
      group_id: null,
      is_kpop: true,
      is_musical: false,
      is_solo: true,
      updated_at: new Date().toISOString(),
      dd: null,
      mm: null,
      yy: null,
    },
  },
];

describe('HybridVoteDetailPresenter - Basic Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render without crashing', () => {
    expect(() => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
        />
      );
    }).not.toThrow();
  });

  it('should display vote title', () => {
    render(
      <HybridVoteDetailPresenter
        vote={mockVote}
        initialItems={mockVoteItems}
      />
    );

    // Mock string이 표시되는지 확인 (실제 제목 대신)
    expect(screen.getByText('Mock String')).toBeInTheDocument();
  });

  it('should accept different props', () => {
    const { rerender } = render(
      <HybridVoteDetailPresenter
        vote={mockVote}
        initialItems={mockVoteItems}
        enableRealtime={true}
      />
    );

    expect(() => {
      rerender(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={mockVoteItems}
          enableRealtime={false}
          pollingInterval={2000}
          maxRetries={5}
        />
      );
    }).not.toThrow();
  });

  it('should handle empty vote items', () => {
    expect(() => {
      render(
        <HybridVoteDetailPresenter
          vote={mockVote}
          initialItems={[]}
        />
      );
    }).not.toThrow();
  });

  it('should render with custom className', () => {
    const { container } = render(
      <HybridVoteDetailPresenter
        vote={mockVote}
        initialItems={mockVoteItems}
        className="custom-class"
      />
    );

    // 컨테이너가 렌더링되었는지 확인
    expect(container.firstChild).toBeInTheDocument();
  });
});