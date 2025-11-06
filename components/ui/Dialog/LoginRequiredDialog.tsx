'use client';

import { useRouter } from 'next/navigation';
import { LogIn, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { LoginRequiredDialogProps } from './types';
import { buttonTheme } from './theme';
import { saveRedirectUrl, redirectToLogin } from '@/utils/auth-redirect';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';
import Image from 'next/image';

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
    const before = typeof window !== 'undefined' ? window.location.href : '';
    let handled = false;
    if (onLogin) {
      try {
        onLogin(redirectUrl);
        handled = true;
      } catch (e) {
        console.warn('[LoginRequiredDialog] custom onLogin error:', e);
      }
    }
    if (!handled) {
      if (redirectUrl) {
        saveRedirectUrl(redirectUrl);
      }
      redirectToLogin(redirectUrl);
    } else {
      try {
        const after = typeof window !== 'undefined' ? window.location.href : '';
        if (before === after) {
          if (redirectUrl) {
            saveRedirectUrl(redirectUrl);
          }
          redirectToLogin(redirectUrl);
        }
      } catch {}
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
      title={undefined}
      description={undefined}
      showCloseButton={false}
      type="info"
      size="md"
      animation="scale"
    >
      {/* Light brand header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary-100 to-secondary-100 p-[1px] mb-4">
        <div className="rounded-2xl bg-white px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 p-[2px]">
              <div className="h-full w-full rounded-[10px] bg-white flex items-center justify-center">
                <Image
                  src="/images/logo.png"
                  alt="Picnic"
                  width={24}
                  height={24}
                  className="opacity-95"
                />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                {getDefaultTitle()}
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                {getDefaultDescription()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Dialog.Footer className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
        <button
          type='button'
          onClick={handleCancel}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            buttonTheme.variants.secondary,
            // improve dark readability
            'dark:bg-white/90 dark:text-gray-900 dark:hover:bg-white focus:ring-2 focus:ring-secondary-300',
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
            // gradient primary → secondary
            'bg-gradient-to-r from-primary-600 to-secondary-600 text-white hover:from-primary-700 hover:to-secondary-700 focus:ring-2 focus:ring-primary-200',
            // dark mode enhancements
            'dark:from-primary-500 dark:to-secondary-500 dark:text-white dark:focus:ring-secondary-300 shadow-md dark:shadow-primary-400/20',
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
