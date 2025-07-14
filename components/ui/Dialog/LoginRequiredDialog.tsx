'use client';

import { useRouter } from 'next/navigation';
import { LogIn, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { LoginRequiredDialogProps } from './types';
import { buttonTheme } from './theme';
import { saveRedirectUrl, redirectToLogin } from '@/utils/auth-redirect';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';

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
    return 'Please log in to continue using this service.';
  };

  const getDefaultLoginText = () => {
    if (loginText) return loginText;
    const translated = t('dialog_login_required_login_button');
    console.log('[LoginRequiredDialog] Login button translation:', translated);
    if (translated && translated.trim() && !translated.startsWith('[')) {
      return translated;
    }
    return 'Login';
  };

  const getDefaultCancelText = () => {
    if (cancelText) return cancelText;
    const translated = t('dialog_login_required_cancel_button');
    console.log('[LoginRequiredDialog] Cancel button translation:', translated);
    if (translated && translated.trim() && !translated.startsWith('[')) {
      return translated;
    }
    return 'Cancel';
  };

  const handleLogin = () => {
    if (onLogin) {
      onLogin(redirectUrl);
    } else {
      if (redirectUrl) {
        saveRedirectUrl(redirectUrl);
      }
      redirectToLogin(redirectUrl);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    dialogProps.onClose();
  };

  return (
    <Dialog
      {...dialogProps}
      isOpen={isOpen}
      title={getDefaultTitle()}
      description={getDefaultDescription()}
      type="info"
      size="md"
      animation="scale"
    >
      <Dialog.Footer className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
        <button
          type='button'
          onClick={handleCancel}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            buttonTheme.variants.secondary,
            'w-full sm:w-auto order-2 sm:order-1',
          )}
        >
          {getDefaultCancelText()}
        </button>
        <button
          type='button'
          onClick={handleLogin}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            buttonTheme.variants.primary,
            'w-full sm:w-auto order-1 sm:order-2',
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <LogIn className='h-4 w-4' />
            <span>{getDefaultLoginText()}</span>
          </div>
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
