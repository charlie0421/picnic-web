/**
 * 구 클라이언트 번들에게 그대로 보여줄 "새로고침 필요" 안내문.
 *
 * `request_id` 강제 이전 번들은 응답의 `error` 문자열을 그대로 화면에 띄운다.
 * 따라서 `error` 에 기계 코드를 넣으면 사용자에게 `VOTE_CLIENT_UPGRADE_REQUIRED` 같은
 * 토큰이 그대로 노출된다. 정작 안내가 필요한 대상이 구 번들이므로, `error` 에는
 * 사람이 읽을 문장을 넣고 기계 코드는 별도 `code` 필드로 준다.
 *
 * 신규 번들은 `code` 로 분기해 자기 i18n 문구를 쓴다.
 */

const MESSAGES: Record<string, string> = {
  ko: '앱이 업데이트되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',
  en: 'The app has been updated. Please refresh the page and try again.',
  ja: 'アプリが更新されました。ページを再読み込みしてからもう一度お試しください。',
  'zh-cn': '应用已更新，请刷新页面后重试。',
  'zh-tw': '應用程式已更新，請重新整理頁面後再試一次。',
  zh: '应用已更新，请刷新页面后重试。', // base zh fallback = 간체
  es: 'La aplicación se ha actualizado. Actualiza la página e inténtalo de nuevo.',
  vi: 'Ứng dụng đã được cập nhật. Vui lòng tải lại trang và thử lại.',
  id: 'Aplikasi telah diperbarui. Muat ulang halaman lalu coba lagi.',
  th: 'แอปได้รับการอัปเดตแล้ว กรุณารีเฟรชหน้าเว็บแล้วลองใหม่อีกครั้ง',
  bn: 'অ্যাপটি আপডেট করা হয়েছে। পৃষ্ঠাটি রিফ্রেশ করে আবার চেষ্টা করুন।',
  tl: 'Na-update na ang app. Paki-refresh ang page at subukan ulit.',
  my: 'အက်ပ်ကို အပ်ဒိတ်လုပ်ပြီးပါပြီ။ စာမျက်နှာကို ပြန်လည်စတင်ပြီး ထပ်စမ်းကြည့်ပါ။',
};

const DEFAULT_LANG = 'en';

/**
 * `Accept-Language` 헤더에서 지원 언어를 고른다. 없으면 영어.
 * q-value 정렬까지는 하지 않는다 — 첫 번째 지원 언어면 충분하다.
 */
export function clientUpgradeMessage(acceptLanguage: string | null): string {
  if (!acceptLanguage) return MESSAGES[DEFAULT_LANG];

  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (!tag) continue;
    if (MESSAGES[tag]) return MESSAGES[tag];
    const base = tag.split('-')[0];
    if (MESSAGES[base]) return MESSAGES[base];
  }
  return MESSAGES[DEFAULT_LANG];
}
