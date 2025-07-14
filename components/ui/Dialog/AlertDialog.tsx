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
      <Dialog.Footer className="flex justify-center sm:justify-end">
        <button
          type='button'
          onClick={handleConfirm}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            buttonTheme.variants[confirmVariant],
            'w-full sm:w-auto min-w-[120px]',
          )}
        >
          {defaultConfirmText}
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
