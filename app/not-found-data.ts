/**
 * 글로벌 Not Found 페이지 — 언어 데이터 및 번역
 *
 * 순수 데이터 모듈로 React에 의존하지 않습니다.
 */

export const languages = {
  ko: { name: '한국어', flag: '🇰🇷' },
  en: { name: 'English', flag: '🇺🇸' },
  ja: { name: '日本語', flag: '🇯🇵' },
  'zh-cn': { name: '简体中文', flag: '🇨🇳' },
  'zh-tw': { name: '繁體中文', flag: '🇹🇼' },
  id: { name: 'Bahasa Indonesia', flag: '🇮🇩' },
  es: { name: 'Español', flag: '🇪🇸' },
  bn: { name: 'বাংলা', flag: '🇧🇩' },
  tl: { name: 'Filipino', flag: '🇵🇭' },
  th: { name: 'ไทย', flag: '🇹🇭' },
  vi: { name: 'Tiếng Việt', flag: '🇻🇳' },
  my: { name: 'မြန်မာဘာသာ', flag: '🇲🇲' },
};

export type Language = keyof typeof languages;

export const translations = {
  ko: {
    title: '페이지를 찾을 수 없습니다',
    subtitle: '요청하신 페이지가 존재하지 않습니다.',
    description: '주소를 다시 확인해주시거나 홈페이지로 돌아가주세요.',
    homeButton: '홈으로 가기',
    backButton: '뒤로 가기',
    languageSelect: '언어 선택'
  },
  en: {
    title: 'Page Not Found',
    subtitle: 'The page you requested does not exist.',
    description: 'Please check the address again or return to the homepage.',
    homeButton: 'Go Home',
    backButton: 'Go Back',
    languageSelect: 'Select Language'
  },
  ja: {
    title: 'ページが見つかりません',
    subtitle: '要求されたページは存在しません。',
    description: 'アドレスを再確認するか、ホームページに戻ってください。',
    homeButton: 'ホームに戻る',
    backButton: '戻る',
    languageSelect: '言語選択'
  },
  'zh-cn': {
    title: '找不到页面',
    subtitle: '您请求的页面不存在。',
    description: '请重新检查地址或返回首页。',
    homeButton: '返回首页',
    backButton: '返回',
    languageSelect: '选择语言'
  },
  'zh-tw': {
    title: '頁面未找到',
    subtitle: '您請求的頁面不存在。',
    description: '請重新檢查地址或返回首頁。',
    homeButton: '返回首頁',
    backButton: '返回',
    languageSelect: '選擇語言'
  },
  id: {
    title: 'Halaman Tidak Ditemukan',
    subtitle: 'Halaman yang Anda minta tidak ada.',
    description: 'Silakan periksa alamat lagi atau kembali ke beranda.',
    homeButton: 'Ke Beranda',
    backButton: 'Kembali',
    languageSelect: 'Pilih Bahasa'
  },
  es: {
    title: 'Página No Encontrada',
    subtitle: 'La página que solicitaste no existe.',
    description: 'Por favor, verifica la dirección nuevamente o regresa a la página de inicio.',
    homeButton: 'Ir al Inicio',
    backButton: 'Volver',
    languageSelect: 'Seleccionar Idioma'
  },
  bn: {
    title: 'পৃষ্ঠা পাওয়া যায়নি',
    subtitle: 'আপনি যে পৃষ্ঠাটি অনুরোধ করেছেন তা বিদ্যমান নেই।',
    description: 'অনুগ্রহ করে ঠিকানা আবার পরীক্ষা করুন বা হোমপেজে ফিরে যান।',
    homeButton: 'হোমে যান',
    backButton: 'ফিরে যান',
    languageSelect: 'ভাষা নির্বাচন করুন'
  },
  tl: {
    title: 'Hindi Natagpuan ang Pahina',
    subtitle: 'Ang pahinang hiniling mo ay hindi umiiral.',
    description: 'Mangyaring suriin muli ang address o bumalik sa homepage.',
    homeButton: 'Pumunta sa Home',
    backButton: 'Bumalik',
    languageSelect: 'Pumili ng Wika'
  },
  th: {
    title: 'ไม่พบหน้า',
    subtitle: 'หน้าที่คุณร้องขอไม่มีอยู่',
    description: 'กรุณาตรวจสอบที่อยู่อีกครั้งหรือกลับไปที่หน้าแรก',
    homeButton: 'ไปที่หน้าแรก',
    backButton: 'กลับ',
    languageSelect: 'เลือกภาษา'
  },
  vi: {
    title: 'Không Tìm Thấy Trang',
    subtitle: 'Trang bạn yêu cầu không tồn tại.',
    description: 'Vui lòng kiểm tra lại địa chỉ hoặc quay lại trang chủ.',
    homeButton: 'Về Trang Chủ',
    backButton: 'Quay Lại',
    languageSelect: 'Chọn Ngôn Ngữ'
  },
  my: {
    title: 'စာမျက်နှာ မတွေ့ရှိပါ',
    subtitle: 'သင်တောင်းဆိုထားသော စာမျက်နှာသည် မရှိပါ။',
    description: 'ကျေးဇူးပြု၍ လိပ်စာကို ထပ်မံစစ်ဆေးပါ သို့မဟုတ် ပင်မစာမျက်နှာသို့ ပြန်သွားပါ။',
    homeButton: 'ပင်မစာမျက်နှာသို့ သွားရန်',
    backButton: 'ပြန်သွားရန်',
    languageSelect: 'ဘာသာစကား ရွေးချယ်ရန်'
  }
};
