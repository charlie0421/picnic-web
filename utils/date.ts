/**
 * 날짜 및 시간 유틸리티 모듈
 *
 * Barrel re-export — 기존 import 경로(@/utils/date) 유지
 */

// Types and constants
export type { RemainingTime, SupportedLanguage } from './date/date-constants';
export { localeMap } from './date/date-constants';

// Timezone utilities
export { getUserTimeZone, getTimeZoneCode, watchTimeZoneChange, clearTimeZoneCaches } from './date/timezone';

// Date formatters
export {
  getCurrentLocale,
  formatDateWithTimeZone,
  formatVotePeriodWithTimeZone,
  formatSimpleDateWithTimeZone,
  calculateRemainingTime,
  formatRelativeTime,
  formatSmartDate,
  formatPostDate,
  formatCommentDate,
} from './date/formatters';
