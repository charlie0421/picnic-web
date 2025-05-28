'use client';

import { Dialog } from './Dialog';
import { AlertDialogProps } from './types';
import { buttonTheme } from './theme';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';

export function AlertDialog({
  onConfirm,
  confirmText,
  confirmVariant = 'primary',
  ...dialogProps
}: AlertDialogProps) {
  const { t } = useLanguageStore();

  // 다국어 지원 기본값
  const defaultConfirmText =
    confirmText || t('dialog.alert.confirm_button') || '확인';

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    dialogProps.onClose();
  };

  return (
    <Dialog {...dialogProps}>
      <Dialog.Footer>
        <button
          type='button'
          onClick={handleConfirm}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            buttonTheme.variants[confirmVariant],
          )}
        >
          {defaultConfirmText}
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
