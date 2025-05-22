import React from 'react';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import { useRouter, usePathname } from 'next/navigation';
import { render as customRender } from '../../../../utils/test-utils';

// 라우터 모킹 
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn()
  }),
}));

// Supabase 인증 모킹
const mockSignIn = jest.fn();
jest.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    isAuthenticated: false,
    isLoading: false,
    error: null
  })
}));

// 언어 스토어 모킹
jest.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'ko',
    t: (key: string) => {
      const translations: Record<string, string> = {
        'label_login': '로그인',
        'label_email': '이메일',
        'label_password': '비밀번호',
        'label_login_submit': '로그인하기',
        'error_email_required': '이메일을 입력해주세요',
        'error_invalid_email': '유효한 이메일 주소를 입력해주세요',
        'error_password_required': '비밀번호를 입력해주세요',
        'error_login_failed': '로그인에 실패했습니다'
      };
      return translations[key] || key;
    }
  })
}));

import LoginForm from '../../../../../components/features/auth/LoginForm';

describe('로그인 폼 상호작용 테스트', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue('/ko/login');
  });

  test('유효한 정보로 로그인 폼 제출 시 인증 함수가 호출되는지 확인', async () => {
    mockSignIn.mockResolvedValue({ error: null, data: { user: { id: '123' } } });
    
    customRender(<LoginForm />);
    
    // 이메일 입력
    const emailInput = screen.getByLabelText(/이메일/i);
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    // 비밀번호 입력
    const passwordInput = screen.getByLabelText(/비밀번호/i);
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    // 폼 제출
    const submitButton = screen.getByText(/로그인하기/i);
    await act(async () => {
      fireEvent.click(submitButton);
    });
    
    // signIn 함수가 올바른 인자로 호출되었는지 확인
    expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
    
    // 로그인 성공 시 리다이렉션 확인
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  test('빈 폼 제출 시 유효성 검사 오류가 표시되는지 확인', async () => {
    customRender(<LoginForm />);
    
    // 폼 제출
    const submitButton = screen.getByText(/로그인하기/i);
    await act(async () => {
      fireEvent.click(submitButton);
    });
    
    // 이메일 필수 오류 메시지 확인
    expect(screen.getByText(/이메일을 입력해주세요/i)).toBeInTheDocument();
    
    // 비밀번호 필수 오류 메시지 확인
    expect(screen.getByText(/비밀번호를 입력해주세요/i)).toBeInTheDocument();
    
    // signIn 함수가 호출되지 않았는지 확인
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('유효하지 않은 이메일로 폼 제출 시 오류가 표시되는지 확인', async () => {
    customRender(<LoginForm />);
    
    // 유효하지 않은 이메일 입력
    const emailInput = screen.getByLabelText(/이메일/i);
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    
    // 비밀번호 입력
    const passwordInput = screen.getByLabelText(/비밀번호/i);
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    // 폼 제출
    const submitButton = screen.getByText(/로그인하기/i);
    await act(async () => {
      fireEvent.click(submitButton);
    });
    
    // 유효하지 않은 이메일 오류 메시지 확인
    expect(screen.getByText(/유효한 이메일 주소를 입력해주세요/i)).toBeInTheDocument();
    
    // signIn 함수가 호출되지 않았는지 확인
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test('로그인 실패 시 오류 메시지가 표시되는지 확인', async () => {
    // 로그인 실패 모킹
    mockSignIn.mockResolvedValue({ error: { message: '로그인에 실패했습니다' }, data: null });
    
    customRender(<LoginForm />);
    
    // 이메일 입력
    const emailInput = screen.getByLabelText(/이메일/i);
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    // 비밀번호 입력
    const passwordInput = screen.getByLabelText(/비밀번호/i);
    fireEvent.change(passwordInput, { target: { value: 'wrong-password' } });
    
    // 폼 제출
    const submitButton = screen.getByText(/로그인하기/i);
    await act(async () => {
      fireEvent.click(submitButton);
    });
    
    // signIn 함수가 호출되었는지 확인
    expect(mockSignIn).toHaveBeenCalled();
    
    // 오류 메시지가 표시되는지 확인
    await waitFor(() => {
      expect(screen.getByText(/로그인에 실패했습니다/i)).toBeInTheDocument();
    });
    
    // 리다이렉션이 발생하지 않았는지 확인
    expect(mockPush).not.toHaveBeenCalled();
  });
}); 