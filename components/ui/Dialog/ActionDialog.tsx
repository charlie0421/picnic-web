'use client';

import { useState } from 'react';
import { Dialog } from './Dialog';
import { ActionDialogProps } from './types';
import { buttonTheme } from './theme';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';

export function ActionDialog({
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  confirmVariant = 'primary',
  cancelVariant = 'secondary',
  isLoading = false,
  disabled = false,
  ...dialogProps
}: ActionDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { t } = useLanguageStore();

  // 다국어 지원 기본값
  const defaultConfirmText =
    confirmText || t('dialog.action.confirm_button') || '확인';
  const defaultCancelText =
    cancelText || t('dialog.action.cancel_button') || '취소';

  const handleConfirm = async () => {
    if (!onConfirm || disabled || isProcessing) return;

    setIsProcessing(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    dialogProps.onClose();
  };

  const isActionDisabled = disabled || isLoading || isProcessing;

  return (
    <Dialog {...dialogProps}>
      <Dialog.Footer>
        {onCancel && (
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
        )}
        {onConfirm && (
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
            {isProcessing ? (
              <>
                <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2' />
                {t('dialog.action.loading') || '처리 중...'}
              </>
            ) : (
              defaultConfirmText
            )}
          </button>
        )}
      </Dialog.Footer>
    </Dialog>
  );
}
