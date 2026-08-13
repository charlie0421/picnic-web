/**
 * 코튼캔디 만료 시각 표시.
 *
 * 서버는 ISO8601(UTC)을 주지만 만료 기준은 **KST 자정**이다.
 * 사용자 로컬 타임존으로 그대로 렌더하면 "2026. 8. 14. 00:00" 이 다른 날짜·시각으로 보인다.
 * 앱과 같은 문자열을 보이려면 Asia/Seoul 로 고정해 포맷해야 한다.
 */
export function formatExpiryDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
