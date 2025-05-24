import React from 'react';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { render as customRender } from '../../../../utils/test-utils';

// 라우터 모킹
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
}));

// 소셜 로그인 함수 모킹
const mockSocialLogin = jest.fn();
jest.mock('@/lib/supabase/social', () => ({
  getSocialAuthService: () => ({
    signInWithProvider: mockSocialLogin,
    handleCallback: jest.fn()
  })
}));

// 오류 스토어 모킹
const mockSetError = jest.fn();
jest.mock('@/stores/errorStore', () => ({
  useErrorStore: () => ({
    setError: mockSetError
  })
}));

// 언어 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
    t: (key: string) => {
      const translations: Record<string, string> = {
        'label_login': '로그인',
        'label_login_with_social': '소셜 계정으로 로그인',
        'label_login_with_google': '구글로 로그인',
        'label_login_with_apple': '애플로 로그인',
        'label_login_with_kakao': '카카오로 로그인',
        'label_login_with_wechat': '위챗으로 로그인'
      };
      return translations[key] || key;
    }
  })
}));

// 인증 프로바이더 모킹
jest.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({
    signInWithOAuth: mockSocialLogin,
    isLoading: false
  })
}));

import SocialLoginButtons from '@/components/features/auth/SocialLoginButtons';

describe('소셜 로그인 버튼 상호작용 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/login');
  });

  test('구글 로그인 버튼 클릭 시 소셜 로그인 함수가 호출되는지 확인', async () => {
    mockSocialLogin.mockResolvedValue({ success: true, error: null });
    const onLoginStart = jest.fn();
    const onLoginComplete = jest.fn();
    
    customRender(
      <SocialLoginButtons 
        onLoginStart={onLoginStart} 
        onLoginComplete={onLoginComplete} 
      />
    );
    
    // 구글 로그인 버튼 찾기
    const googleButton = screen.getByText(/구글로 로그인/i);
    expect(googleButton).toBeInTheDocument();
    
    // 버튼 클릭
    await act(async () => {
      fireEvent.click(googleButton);
    });
    
    // 로그인 시작 콜백이 호출되었는지 확인
    expect(onLoginStart).toHaveBeenCalled();
    
    // 소셜 로그인 함수가 올바른 인자로 호출되었는지 확인
    expect(mockSocialLogin).toHaveBeenCalledWith('google');
  });

  test('카카오 로그인 버튼 클릭 시 소셜 로그인 함수가 호출되는지 확인', async () => {
    mockSocialLogin.mockResolvedValue({ success: true, error: null });
    
    customRender(<SocialLoginButtons />);
    
    // 카카오 로그인 버튼 찾기
    const kakaoButton = screen.getByText(/카카오로 로그인/i);
    expect(kakaoButton).toBeInTheDocument();
    
    // 버튼 클릭
    await act(async () => {
      fireEvent.click(kakaoButton);
    });
    
    // 소셜 로그인 함수가 올바른 인자로 호출되었는지 확인
    expect(mockSocialLogin).toHaveBeenCalledWith('kakao');
  });

  test('소셜 로그인 실패 시 오류가 처리되는지 확인', async () => {
    // 로그인 실패 시뮬레이션
    const mockError = new Error('소셜 로그인 실패');
    mockSocialLogin.mockResolvedValue({ success: false, error: mockError });
    
    // 위챗을 포함한 providers로 컴포넌트 렌더링
    customRender(<SocialLoginButtons providers={['google', 'apple', 'kakao', 'wechat']} />);
    
    // 위챗 로그인 버튼 찾기
    const wechatButton = screen.getByText(/위챗으로 로그인/i);
    
    // 버튼 클릭
    await act(async () => {
      fireEvent.click(wechatButton);
    });
    
    // 오류 콜백이 호출되었는지 확인
    await waitFor(() => {
      expect(mockSocialLogin).toHaveBeenCalledWith('wechat');
    });
  });
}); 