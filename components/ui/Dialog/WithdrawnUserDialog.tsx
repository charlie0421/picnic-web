'use client';

import { UserX } from 'lucide-react';
import { Dialog } from './Dialog';
import { buttonTheme } from './theme';
import { useLanguageStore } from '@/stores/languageStore';
import { cn } from '@/lib/utils';

export interface WithdrawnUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
}

export function WithdrawnUserDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmText,
}: WithdrawnUserDialogProps) {
  const { t } = useLanguageStore();

  const getTitle = () => {
    if (title) return title;
    const translated = t('error_message_withdrawal_title');
    if (translated && translated.trim() && !translated.startsWith('[')) {
      return translated;
    }
    return t('error_message_withdrawal') || '탈퇴한 회원입니다';
  };

  const getDescription = () => {
    if (description) return description;
    const translated = t('error_message_withdrawal_description');
    if (translated && translated.trim() && !translated.startsWith('[')) {
      return translated;
    }
    return t('error_message_withdrawal') || '탈퇴한 회원은 이 기능을 사용할 수 없습니다.';
  };

  const getConfirmText = () => {
    if (confirmText) return confirmText;
    const translated = t('dialog.alert.confirm_button');
    if (translated && translated.trim() && !translated.startsWith('[')) {
      return translated;
    }
    return '확인';
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={undefined}
      description={undefined}
      showCloseButton={false}
      type="error"
      size="sm"
      animation="scale"
    >
      {/* Error style header with gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-100 to-rose-100 p-[1px] mb-4">
        <div className="rounded-2xl bg-white px-5 py-6">
          <div className="flex items-center gap-4">
            {/* Error icon with gradient background */}
            <div className="relative h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 p-[2px] shadow-lg shadow-red-200">
              <div className="h-full w-full rounded-[10px] bg-white flex items-center justify-center">
                <UserX className="h-6 w-6 text-red-500" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                {getTitle()}
              </h3>
              <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">
                {getDescription()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Dialog.Footer className="flex justify-center sm:justify-end">
        <button
          type='button'
          onClick={onClose}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:from-red-600 hover:to-rose-600 focus:ring-2 focus:ring-red-200 shadow-md',
            'w-full sm:w-auto min-w-[120px]',
          )}
        >
          {getConfirmText()}
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
