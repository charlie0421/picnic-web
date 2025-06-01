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
  const { t } = useLanguageStore();

  // 다국어 지원 기본값
  const defaultTitle =
    title || t('dialog_login_required_title');
  const defaultDescription =
    description ||
    t('dialog_login_required_description');
  const defaultLoginText =
    loginText || t('dialog_login_required_login_button');
  const defaultCancelText =
    cancelText || t('dialog_login_required_cancel_button');

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
