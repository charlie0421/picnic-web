'use client';

import { useState } from 'react';
import { Dialog } from './Dialog';
import { ConfirmDialogProps } from './types';
import { buttonTheme } from './theme';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';

export function ConfirmDialog({
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  confirmVariant = 'primary',
  cancelVariant = 'secondary',
  isLoading = false,
  disabled = false,
  ...dialogProps
}: ConfirmDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const { t } = useLanguageStore();

  // 다국어 지원 기본값
  const defaultConfirmText =
    confirmText || t('dialog.confirm.confirm_button') || '확인';
  const defaultCancelText =
    cancelText || t('dialog.confirm.cancel_button') || '취소';

  const handleConfirm = async () => {
    if (disabled || isConfirming) return;

    setIsConfirming(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Confirm action failed:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    dialogProps.onClose();
  };

  const isActionDisabled = disabled || isLoading || isConfirming;

  return (
    <Dialog {...dialogProps}>
      <Dialog.Footer>
        <button
          type='button'
          onClick={handleCancel}
          disabled={isActionDisabled}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            buttonTheme.variants[cancelVariant],
          )}
        >
          {defaultCancelText}
        </button>
        <button
          type='button'
          onClick={handleConfirm}
          disabled={isActionDisabled}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            buttonTheme.variants[confirmVariant],
            isActionDisabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {isConfirming ? (
            <>
              <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2' />
              {t('dialog.confirm.loading') || '처리 중...'}
            </>
          ) : (
            defaultConfirmText
          )}
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
