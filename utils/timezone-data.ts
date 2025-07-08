// 웹에서 수집한 포괄적인 시간대 약어 데이터베이스
// 출처: timeanddate.com + IANA 데이터베이스
export const TIMEZONE_ABBREVIATIONS: Record<string, string> = {
  // 아시아-태평양
  'Asia/Seoul': 'KST',
  'Asia/Tokyo': 'JST', 
  'Asia/Shanghai': 'CST',
  'Asia/Hong_Kong': 'HKT',
  'Asia/Singapore': 'SGT',
  'Asia/Bangkok': 'ICT',
  'Asia/Jakarta': 'WIB',
  'Asia/Kolkata': 'IST',
  'Asia/Dubai': 'GST',
  'Asia/Riyadh': 'AST',
  
  // 북미
  'America/New_York': 'EST',
  'America/Los_Angeles': 'PST',
  'America/Chicago': 'CST',
  'America/Denver': 'MST',
  'America/Anchorage': 'AKST',
  'America/Hawaii': 'HST',
  'America/Toronto': 'EST',
  'America/Vancouver': 'PST',
  
  // 유럽-아프리카  
  'Europe/London': 'GMT',
  'Europe/Berlin': 'CET',
  'Europe/Paris': 'CET',
  'Europe/Rome': 'CET',
  'Europe/Madrid': 'CET',
  'Europe/Amsterdam': 'CET',
  'Europe/Moscow': 'MSK',
  'Africa/Lagos': 'WAT',
  'Africa/Cairo': 'EET',
  'Africa/Johannesburg': 'SAST',
  
  // 남미
  'America/Sao_Paulo': 'BRT',
  'America/Argentina/Buenos_Aires': 'ART',
  'America/Santiago': 'CLT',
  'America/Bogota': 'COT',
  'America/Lima': 'PET',
  
  // 오세아니아
  'Australia/Sydney': 'AEDT',
  'Australia/Melbourne': 'AEDT', 
  'Australia/Perth': 'AWST',
  'Pacific/Auckland': 'NZDT',
  'Pacific/Fiji': 'FJT',
  'Pacific/Honolulu': 'HST',
  
  // 기타 주요 지역들
  'Asia/Tehran': 'IRST',
  'Asia/Kabul': 'AFT',
  'Asia/Kathmandu': 'NPT',
  'Asia/Dhaka': 'BST',
  'Asia/Karachi': 'PKT',
  'Asia/Tashkent': 'UZT',
  'Asia/Yekaterinburg': 'YEKT',
  'Asia/Novosibirsk': 'NOVT',
  'Asia/Krasnoyarsk': 'KRAT',
  'Asia/Irkutsk': 'IRKT',
  'Asia/Yakutsk': 'YAKT',
  'Asia/Vladivostok': 'VLAT',
  'Asia/Magadan': 'MAGT',
  'Asia/Kamchatka': 'PETT'
};

// 시간대 약어로 역검색하는 함수  
export function getTimeZonesByAbbreviation(abbreviation: string): string[] {
  return Object.entries(TIMEZONE_ABBREVIATIONS)
    .filter(([_, abbr]) => abbr === abbreviation)
    .map(([tz, _]) => tz);
}

// 모든 지원되는 약어 목록
export function getSupportedAbbreviations(): string[] {
  return Array.from(new Set(Object.values(TIMEZONE_ABBREVIATIONS))).sort();
} 