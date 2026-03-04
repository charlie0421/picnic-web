import { ko, ja, zhCN, zhTW, vi, th, id, es, bn, enUS } from 'date-fns/locale';

export const ANIMAL_TIME_SLOTS: Array<{ key: string; translationKey: string }> = [
  { key: '1',  translationKey: 'goonghap_time_slot1' },
  { key: '2',  translationKey: 'goonghap_time_slot2' },
  { key: '3',  translationKey: 'goonghap_time_slot3' },
  { key: '4',  translationKey: 'goonghap_time_slot4' },
  { key: '5',  translationKey: 'goonghap_time_slot5' },
  { key: '6',  translationKey: 'goonghap_time_slot6' },
  { key: '7',  translationKey: 'goonghap_time_slot7' },
  { key: '8',  translationKey: 'goonghap_time_slot8' },
  { key: '9',  translationKey: 'goonghap_time_slot9' },
  { key: '10', translationKey: 'goonghap_time_slot10' },
  { key: '11', translationKey: 'goonghap_time_slot11' },
  { key: '12', translationKey: 'goonghap_time_slot12' },
];

export const dateLocaleMap: Record<string, any> = {
  ko, ja, 'zh-cn': zhCN, 'zh-tw': zhTW, vi, th, id, es, bn, en: enUS
};

/** Parse translated time slot: "name|(timeRange)|emoji" format */
export function parseTimeSlot(translatedValue: string) {
  const parts = translatedValue.split('|');
  const name = parts[0]?.trim() || '';
  const timeRange = parts[1]?.replace(/[()]/g, '').trim() || '';
  const emoji = parts[2]?.trim() || '';
  return { name, timeRange, emoji };
}

export const legacyAnimalKeyToCode: Record<string, string> = {
  ja: '1', chuk: '2', in: '3', myo: '4', jin: '5', sa: '6', o: '7', mi: '8', sin: '9', yu: '10', sul: '11', ha: '12'
};

export function hourToAnimalCode(hour: number): string {
  if (hour === 23 || hour === 0) return '1';
  const code = Math.floor((hour + 1) / 2) + 1;
  return String(Math.min(Math.max(code, 1), 12));
}

/** Get artist name with locale priority: locale -> en -> ko -> '' */
export function getArtistName(name: any, locale: string): string {
  if (typeof name === 'string') return name;
  if (!name) return '';
  return name[locale] || name['en'] || name['ko'] || '';
}
