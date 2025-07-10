import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { render as customRender } from '../../../../utils/test-utils';

// 마이페이지 모킹
jest.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({
    userProfile: {
      nickname: '테스트 사용자',
      email: 'test@example.com',
      avatarUrl: null,
      birthDate: '1990-01-01',
      isAdmin: false
    },
    isAuthenticated: true,
    isLoading: false,
    signOut: jest.fn()
  })
}));

// 언어 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'label_mypage_notice': '공지사항',
        'label_mypage_faq': '자주 묻는 질문',
        'label_mypage_privacy_policy': '개인정보 처리방침',
        'label_mypage_terms_of_use': '이용약관',
        'label_mypage_withdrawal': '회원탈퇴'
      };
      return translations[key] || key;
    },
    currentLanguage: 'ko'
  })
}));

// 모듈 모킹
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
}));

// 실제 페이지 컴포넌트 불러오기
import MyPage from '../../../../../app/[lang]/(mypage)/mypage/page';

describe('마이페이지 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/mypage');
  });

  test('마이페이지가 정상적으로 렌더링되는지 확인', async () => {
    const mockParams = Promise.resolve({ lang: 'ko' });
    const { container } = customRender(
      <MyPage params={mockParams} />
    );
    
    await waitFor(() => {
      // 사용자 정보가 표시되는지 확인
      expect(screen.getByText('테스트 사용자')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });
    
    // 프로필 수정 링크가 있는지 확인
    expect(screen.getByText('프로필 수정')).toBeInTheDocument();
    
    // 로그아웃 버튼이 있는지 확인
    expect(screen.getByText('로그아웃')).toBeInTheDocument();
  });
  
  test('서비스 정보 링크가 올바르게 표시되는지 확인', async () => {
    const mockParams = Promise.resolve({ lang: 'ko' });
    customRender(
      <MyPage params={mockParams} />
    );
    
    await waitFor(() => {
      expect(screen.getByText('공지사항')).toBeInTheDocument();
      expect(screen.getByText('자주 묻는 질문')).toBeInTheDocument();
      expect(screen.getByText('개인정보 처리방침')).toBeInTheDocument();
      expect(screen.getByText('이용약관')).toBeInTheDocument();
      expect(screen.getByText('회원탈퇴')).toBeInTheDocument();
    });
  });
}); 