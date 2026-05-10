'use client';

import { Dialog } from '@/components/ui/Dialog/Dialog';
import { buttonTheme } from '@/components/ui/Dialog/theme';
import { cn } from '@/lib/utils';
import { useLanguageStore } from '@/stores/languageStore';

export type RateLimitedChannel =
  | 'ad_watch'
  | 'signup'
  | 'attendance'
  | 'artist_request';

interface RateLimitedDialogProps {
  isOpen: boolean;
  channel: RateLimitedChannel | string;
  onClose: () => void;
  /** signup 채널의 CS 링크 mailto. 기본값 cs@picnic.fan. */
  csEmail?: string;
}

const CHANNEL_KEY: Record<string, { title: string; message: string }> = {
  ad_watch: {
    title: 'error_anti_abuse_ad_title',
    message: 'error_anti_abuse_ad_message',
  },
  signup: {
    title: 'error_anti_abuse_signup_title',
    message: 'error_anti_abuse_signup_message',
  },
  attendance: {
    title: 'error_anti_abuse_attendance_title',
    message: 'error_anti_abuse_attendance_message',
  },
  artist_request: {
    title: 'error_anti_abuse_artist_request_title',
    message: 'error_anti_abuse_artist_request_message',
  },
};

/**
 * Anti-abuse rate-limited dialog. 채널별 톤이 다름:
 *   - signup        : 부분 명확 + 고객센터 mailto 링크
 *   - ad_watch / attendance / artist_request : 모호 ("잠시 후 다시 시도")
 *   - 알 수 없는 채널 : attendance copy 로 fallback (모호 톤)
 */
export function RateLimitedDialog({
  isOpen,
  channel,
  onClose,
  csEmail = 'cs@picnic.fan',
}: RateLimitedDialogProps) {
  const { t } = useLanguageStore();
  const isSignup = channel === 'signup';
  const keys = CHANNEL_KEY[channel] ?? CHANNEL_KEY.attendance;
  const title = t(keys.title) || '';
  const message = t(keys.message) || '';
  const okLabel = t('dialog_button_ok') || t('button_ok') || '확인';
  const csLabel = t('button_cs_inquiry') || '고객센터 문의';

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} description={message}>
      <Dialog.Footer className='flex flex-col sm:flex-row justify-center sm:justify-end gap-2'>
        {isSignup && (
          <a
            href={`mailto:${csEmail}`}
            className={cn(
              buttonTheme.base,
              buttonTheme.sizes.md,
              buttonTheme.variants.secondary,
              'w-full sm:w-auto min-w-[120px] inline-flex items-center justify-center',
            )}
          >
            {csLabel}
          </a>
        )}
        <button
          type='button'
          onClick={onClose}
          className={cn(
            buttonTheme.base,
            buttonTheme.sizes.md,
            buttonTheme.variants.primary,
            'w-full sm:w-auto min-w-[120px]',
          )}
        >
          {okLabel}
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
