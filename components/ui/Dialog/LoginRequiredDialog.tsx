'use client';

import { useRouter } from 'next/navigation';
import { LogIn, X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { LoginRequiredDialogProps } from './types';
import { saveRedirectUrl, redirectToLogin } from '@/utils/auth-redirect';
import { useLanguageStore } from '@/stores/languageStore';

export function LoginRequiredDialog({
  isOpen = false,
  redirectUrl,
  onLogin,
  onCancel,
  title,
  description,
  loginText,
  cancelText,
  ...dialogProps
}: LoginRequiredDialogProps) {
  const router = useRouter();
  const { t, currentLanguage, isHydrated } = useLanguageStore();

  // 디버깅용 로깅
  console.log('[LoginRequiredDialog] State:', {
    currentLanguage,
    isHydrated,
    isOpen,
    hasTitle: !!title,
    hasDescription: !!description
  });

  // 더 안전한 다국어 지원 기본값
  const getDefaultTitle = () => {
    if (title) return title;
    const translated = t('dialog_content_login_required');
    console.log('[LoginRequiredDialog] Title translation:', translated);
    if (translated && translated.trim() && !translated.startsWith('[')) {
      return translated;
    }
    return 'Login Required';
  };

  const getDefaultDescription = () => {
    if (description) return description;
    const translated = t('dialog_login_required_description');
    console.log('[LoginRequiredDialog] Description translation:', translated);
    if (translated && translated.trim() && !translated.startsWith('[')) {
      return translated;
    }
    
    // fallback to title key
    const fallback = t('dialog_content_login_required');
    console.log('[LoginRequiredDialog] Fallback translation:', fallback);
    if (fallback && fallback.trim() && !fallback.startsWith('[')) {
      return 'Please log in to continue.';
    }
    return 'You need to log in to use this feature.';
  };

  const defaultTitle = getDefaultTitle();
  const defaultDescription = getDefaultDescription();
  const defaultLoginText = loginText || t('dialog_button_ok') || 'OK';
  const defaultCancelText = cancelText || t('dialog_button_cancel') || 'Cancel';

  // 기본 로그인 핸들러
  const handleLogin = () => {
    if (onLogin) {
      onLogin(redirectUrl);
    } else {
      // 기본 로그인 로직: 리다이렉트 유틸리티 사용
      if (redirectUrl) {
        saveRedirectUrl(redirectUrl);
      }
      redirectToLogin(redirectUrl);
    }
  };

  // 취소 핸들러
  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <ConfirmDialog
      {...dialogProps}
      isOpen={isOpen}
      title={defaultTitle}
      description={defaultDescription}
      confirmText={defaultLoginText}
      cancelText={defaultCancelText}
      confirmVariant='primary'
      onConfirm={handleLogin}
      onCancel={handleCancel}
    />
  );
}
