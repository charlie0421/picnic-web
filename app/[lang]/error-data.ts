/**
 * 500 에러 페이지 데이터
 *
 * 언어 목록, 번역 데이터, 관련 타입을 포함합니다.
 * React 의존성 없이 순수 데이터만 제공합니다.
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

export const translations = {
  ko: {
    title: '서버 오류가 발생했습니다',
    subtitle: '죄송합니다. 일시적인 서버 문제가 발생했습니다.',
    description: '잠시 후 다시 시도해주세요. 문제가 계속되면 고객센터로 문의해주세요.',
    homeButton: '홈으로 가기',
    backButton: '뒤로 가기',
    retryButton: '다시 시도',
    languageSelect: '언어 선택',
    errorCode: '오류 코드: 500'
  },
  en: {
    title: 'Server Error Occurred',
    subtitle: 'Sorry, we encountered a temporary server issue.',
    description: 'Please try again in a moment. If the problem continues, contact customer service.',
    homeButton: 'Go Home',
    backButton: 'Go Back',
    retryButton: 'Try Again',
    languageSelect: 'Select Language',
    errorCode: 'Error Code: 500'
  },
  ja: {
    title: 'サーバーエラーが発生しました',
    subtitle: '申し訳ございません。一時的なサーバーの問題が発生しました。',
    description: 'しばらく後に再度お試しください。問題が続く場合は、カスタマーサービスにお問い合わせください。',
    homeButton: 'ホームに戻る',
    backButton: '戻る',
    retryButton: '再試行',
    languageSelect: '言語選択',
    errorCode: 'エラーコード: 500'
  },
  'zh-cn': {
    title: '服务器错误',
    subtitle: '抱歉，遇到了临时的服务器问题。',
    description: '请稍后再试。如果问题持续，请联系客服。',
    homeButton: '回到首页',
    backButton: '返回',
    retryButton: '重试',
    languageSelect: '选择语言',
    errorCode: '错误代码: 500'
  },
  'zh-tw': {
    title: '伺服器錯誤',
    subtitle: '抱歉，遇到了暫時的伺服器問題。',
    description: '請稍後再試。如果問題持續，請聯絡客服。',
    homeButton: '回到首頁',
    backButton: '返回',
    retryButton: '重試',
    languageSelect: '選擇語言',
    errorCode: '錯誤代碼: 500'
  },
  id: {
    title: 'Terjadi Kesalahan Server',
    subtitle: 'Maaf, terjadi masalah server sementara.',
    description: 'Silakan coba lagi nanti. Jika masalah berlanjut, hubungi layanan pelanggan.',
    homeButton: 'Ke Beranda',
    backButton: 'Kembali',
    retryButton: 'Coba Lagi',
    languageSelect: 'Pilih Bahasa',
    errorCode: 'Kode Error: 500'
  },
  es: {
    title: 'Error del Servidor',
    subtitle: 'Lo sentimos, encontramos un problema temporal del servidor.',
    description: 'Por favor, inténtalo de nuevo en un momento. Si el problema continúa, contacta con el servicio al cliente.',
    homeButton: 'Ir al Inicio',
    backButton: 'Volver',
    retryButton: 'Reintentar',
    languageSelect: 'Seleccionar Idioma',
    errorCode: 'Código de Error: 500'
  },
  bn: {
    title: 'সার্ভার ত্রুটি ঘটেছে',
    subtitle: 'দুঃখিত, আমরা একটি অস্থায়ী সার্ভার সমস্যার সম্মুখীন হয়েছি।',
    description: 'অনুগ্রহ করে একটু পরে আবার চেষ্টা করুন। সমস্যা অব্যাহত থাকলে, গ্রাহক সেবার সাথে যোগাযোগ করুন।',
    homeButton: 'হোমে যান',
    backButton: 'ফিরে যান',
    retryButton: 'আবার চেষ্টা করুন',
    languageSelect: 'ভাষা নির্বাচন করুন',
    errorCode: 'ত্রুটি কোড: 500'
  },
  tl: {
    title: 'Naganap ang Server Error',
    subtitle: 'Paumanhin, nakatagpo kami ng pansamantalang server issue.',
    description: 'Mangyaring subukan muli sa ilang sandali. Kung patuloy ang problema, makipag-ugnayan sa customer service.',
    homeButton: 'Pumunta sa Home',
    backButton: 'Bumalik',
    retryButton: 'Subukan Muli',
    languageSelect: 'Pumili ng Wika',
    errorCode: 'Error Code: 500'
  },
  th: {
    title: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์',
    subtitle: 'ขออภัย พบปัญหาชั่วคราวของเซิร์ฟเวอร์',
    description: 'กรุณาลองใหม่อีกครั้งในอีกสักครู่ หากปัญหายังคงอยู่ กรุณาติดต่อฝ่ายบริการลูกค้า',
    homeButton: 'ไปที่หน้าแรก',
    backButton: 'กลับ',
    retryButton: 'ลองอีกครั้ง',
    languageSelect: 'เลือกภาษา',
    errorCode: 'รหัสข้อผิดพลาด: 500'
  },
  vi: {
    title: 'Lỗi Máy Chủ',
    subtitle: 'Xin lỗi, chúng tôi gặp phải sự cố tạm thời của máy chủ.',
    description: 'Vui lòng thử lại sau một lúc. Nếu vấn đề vẫn tiếp tục, vui lòng liên hệ dịch vụ khách hàng.',
    homeButton: 'Về Trang Chủ',
    backButton: 'Quay Lại',
    retryButton: 'Thử Lại',
    languageSelect: 'Chọn Ngôn Ngữ',
    errorCode: 'Mã Lỗi: 500'
  },
  my: {
    title: 'ဆာဗား အမှားအယွင်း ဖြစ်ပွားခဲ့သည်',
    subtitle: 'ဝမ်းနည်းပါတယ်၊ ကျွန်ုပ်တို့သည် ယာယီဆာဗား ပြဿနာတစ်ခုနှင့် ရင်ဆိုင်ခဲ့ရသည်။',
    description: 'ကျေးဇူးပြု၍ ခဏအကြာတွင် ထပ်မံကြိုးစားပါ။ ပြဿနာ ဆက်လက်ရှိနေပါက၊ ဖောက်သည်ဝန်ဆောင်မှုသို့ ဆက်သွယ်ပါ။',
    homeButton: 'ပင်မစာမျက်နှာသို့ သွားရန်',
    backButton: 'ပြန်သွားရန်',
    retryButton: 'ထပ်မံကြိုးစားရန်',
    languageSelect: 'ဘာသာစကား ရွေးချယ်ရန်',
    errorCode: 'အမှားအယွင်း ကုဒ်: 500'
  }
};

export type Language = keyof typeof languages;

export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}
