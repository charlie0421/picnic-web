import { SUPPORTED_LANGUAGES, type Language } from '@/config/settings';

/**
 * Not Found page data: language list, translations, and type guard.
 * Pure data module -- no React, no 'use client'.
 */

// 언어 목록
export const languages = [
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'zh-cn', name: '简体中文', flag: '🇨🇳' },
  { code: 'zh-tw', name: '繁體中文', flag: '🇹🇼' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'bn', name: 'বাংলা', flag: '🇧🇩' },
  { code: 'tl', name: 'Filipino', flag: '🇵🇭' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'my', name: 'မြန်မာဘာသာ', flag: '🇲🇲' },
];

// 번역 객체
export const translations = {
  ko: {
    title: '페이지를 찾을 수 없습니다',
    subtitle: '404',
    description: '찾고 계신 페이지가 삭제되었거나, 이름이 변경되었거나, 일시적으로 사용할 수 없습니다.',
    homeButton: '홈으로',
    backButton: '이전 페이지',
    languageSelect: '언어',
  },
  en: {
    title: 'Page Not Found',
    subtitle: '404',
    description: 'The page you are looking for has been deleted, renamed, or is temporarily unavailable.',
    homeButton: 'Home',
    backButton: 'Previous Page',
    languageSelect: 'Language',
  },
  ja: {
    title: 'ページが見つかりません',
    subtitle: '404',
    description: 'お探しのページは削除されたか、名前が変更されたか、一時的にご利用いただけません。',
    homeButton: 'ホーム',
    backButton: '前のページ',
    languageSelect: '言語',
  },
  'zh-cn': {
    title: '页面未找到',
    subtitle: '404',
    description: '您正在寻找的页面已被删除、重命名或暂时不可用。',
    homeButton: '首页',
    backButton: '上一页',
    languageSelect: '语言',
  },
  'zh-tw': {
    title: '頁面未找到',
    subtitle: '404',
    description: '您正在尋找的頁面已被刪除、重新命名或暫時不可用。',
    homeButton: '首頁',
    backButton: '上一頁',
    languageSelect: '語言',
  },
  id: {
    title: 'Halaman Tidak Ditemukan',
    subtitle: '404',
    description: 'Halaman yang Anda cari telah dihapus, diubah namanya, atau sementara tidak tersedia.',
    homeButton: 'Beranda',
    backButton: 'Halaman Sebelumnya',
    languageSelect: 'Bahasa',
  },
  es: {
    title: 'Página No Encontrada',
    subtitle: '404',
    description: 'La página que buscas ha sido eliminada, renombrada o no está disponible temporalmente.',
    homeButton: 'Inicio',
    backButton: 'Página Anterior',
    languageSelect: 'Idioma',
  },
  bn: {
    title: 'পৃষ্ঠা পাওয়া যায়নি',
    subtitle: '404',
    description: 'আপনি যে পৃষ্ঠাটি খুঁজছেন তা মুছে ফেলা হয়েছে, নাম পরিবর্তন করা হয়েছে বা সাময়িকভাবে উপলব্ধ নয়।',
    homeButton: 'হোম',
    backButton: 'পূর্ববর্তী পৃষ্ঠা',
    languageSelect: 'ভাষা',
  },
  tl: {
    title: 'Hindi Natagpuan ang Pahina',
    subtitle: '404',
    description: 'Ang pahinang hinahanap mo ay natanggal, pinalitan ng pangalan, o pansamantalang hindi available.',
    homeButton: 'Home',
    backButton: 'Nakaraang Pahina',
    languageSelect: 'Wika',
  },
  th: {
    title: 'ไม่พบหน้า',
    subtitle: '404',
    description: 'หน้าที่คุณกำลังมองหาถูกลบ เปลี่ยนชื่อ หรือไม่พร้อมใช้งานชั่วคราว',
    homeButton: 'หน้าแรก',
    backButton: 'หน้าก่อนหน้า',
    languageSelect: 'ภาษา',
  },
  vi: {
    title: 'Không Tìm Thấy Trang',
    subtitle: '404',
    description: 'Trang bạn đang tìm kiếm đã bị xóa, đổi tên hoặc tạm thời không khả dụng.',
    homeButton: 'Trang Chủ',
    backButton: 'Trang Trước',
    languageSelect: 'Ngôn Ngữ',
  },
  my: {
    title: 'စာမျက်နှာ မတွေ့ရှိပါ',
    subtitle: '404',
    description: 'သင်ရှာဖွေနေသော စာမျက်နှာကို ဖျက်လိုက်ပြီး၊ အမည်ပြောင်းလိုက်ပြီး သို့မဟုတ် ယာယီအားဖြင့် မရရှိနိုင်ပါ။',
    homeButton: 'ပင်မစာမျက်နှာ',
    backButton: 'ယခင်စာမျက်နှာ',
    languageSelect: 'ဘာသာစကား',
  },
};

// 언어가 유효한지 확인하는 타입 가드 함수
export function isValidLanguage(lang: string): lang is Language {
  return SUPPORTED_LANGUAGES.includes(lang as Language);
}
