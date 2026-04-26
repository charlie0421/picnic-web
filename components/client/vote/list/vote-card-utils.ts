export const VOTE_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
} as const;

export type VoteStatus = (typeof VOTE_STATUS)[keyof typeof VOTE_STATUS];

export const STATUS_TAG_COLORS: Record<VoteStatus, string> = {
  // 예정: secondary 토큰
  [VOTE_STATUS.UPCOMING]: 'bg-secondary-100 text-secondary-700 border border-secondary-200',
  // 진행중: primary 토큰
  [VOTE_STATUS.ONGOING]: 'bg-primary-100 text-primary-700 border border-primary-200',
  // 종료: sub 토큰
  [VOTE_STATUS.COMPLETED]: 'bg-sub-100 text-sub-700 border border-sub-200',
};

export const TIMELINE_TONES: Record<VoteStatus, string> = {
  [VOTE_STATUS.UPCOMING]: 'bg-secondary-50/80 border-secondary-200 text-secondary-800',
  [VOTE_STATUS.ONGOING]: 'bg-primary-50/80 border-primary-200 text-primary-800',
  [VOTE_STATUS.COMPLETED]: 'bg-sub-50/80 border-sub-200 text-sub-800',
};

// 카테고리별 색상
export const CATEGORY_COLORS = {
  birthday: 'bg-pink-100 text-pink-800 border border-pink-200',
  debut: 'bg-blue-100 text-blue-800 border border-blue-200',
  accumulated: 'bg-purple-100 text-purple-800 border border-purple-200',
  special: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
  event: 'bg-orange-100 text-orange-800 border border-orange-200',
} as const;

// 서브카테고리별 색상
export const SUB_CATEGORY_COLORS = {
  male: 'bg-blue-50 text-blue-600 border border-blue-100',
  female: 'bg-pink-50 text-pink-600 border border-pink-100',
  group: 'bg-green-50 text-green-600 border border-green-100',
  all: 'bg-gray-50 text-gray-600 border border-gray-100',
} as const;

export const STATUS_LABEL_FALLBACK: Record<VoteStatus, string> = {
  [VOTE_STATUS.UPCOMING]: 'Upcoming',
  [VOTE_STATUS.ONGOING]: 'In Progress',
  [VOTE_STATUS.COMPLETED]: 'Completed',
};

const CATEGORY_LABEL_FALLBACK: Record<string, string> = {
  birthday: 'Birthday',
  debut: 'Debut',
  accumulated: 'Accumulated',
  special: 'Special',
  event: 'Event',
  weekly: 'Weekly',
};

const SUBCATEGORY_LABEL_FALLBACK: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  group: 'Group',
  all: 'All',
};

export const computeVoteStatus = (
  startAt: string | null | undefined,
  stopAt: string | null | undefined,
  referenceTime: Date,
): VoteStatus => {
  if (!startAt || !stopAt) return VOTE_STATUS.UPCOMING;
  const start = new Date(startAt);
  const end = new Date(stopAt);
  if (referenceTime < start) return VOTE_STATUS.UPCOMING;
  if (referenceTime > end) return VOTE_STATUS.COMPLETED;
  return VOTE_STATUS.ONGOING;
};

export const computeTimeLeft = (
  status: VoteStatus,
  startAt: string | null | undefined,
  stopAt: string | null | undefined,
  referenceTime: Date,
): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} | null => {
  const target =
    status === VOTE_STATUS.UPCOMING ? startAt :
    status === VOTE_STATUS.ONGOING ? stopAt :
    null;

  if (!target) return null;

  const now = referenceTime.getTime();
  const targetTime = new Date(target).getTime();
  const difference = targetTime - now;

  if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

  const days = Math.floor(difference / (1000 * 60 * 60 * 24));
  const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((difference % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
};

export interface VoteTimeInfo {
  status: VoteStatus;
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
  relativeSinceQuery: string | null;
}

export const getStatusText = (status: VoteStatus, t: (key: string) => string): string => {
  const text = (() => {
    switch (status) {
      case VOTE_STATUS.UPCOMING:
        return t('label_tabbar_vote_upcoming') || STATUS_LABEL_FALLBACK[status];
      case VOTE_STATUS.ONGOING:
        return t('label_tabbar_vote_active') || STATUS_LABEL_FALLBACK[status];
      case VOTE_STATUS.COMPLETED:
        return t('label_tabbar_vote_end') || STATUS_LABEL_FALLBACK[status];
      default:
        return STATUS_LABEL_FALLBACK[VOTE_STATUS.ONGOING];
    }
  })();

  return text?.trim() ?? '';
};

export const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());

export const getCategoryLabel = (
  category: string | undefined | null,
  t: (key: string) => string,
): string | null => {
  if (!category) return null;
  return (
    t(`label_vote_${category}`) ||
    CATEGORY_LABEL_FALLBACK[category] ||
    toTitleCase(category)
  );
};

export const getSubCategoryLabel = (
  subCategory: string | undefined | null,
  t: (key: string) => string,
): string | null => {
  if (!subCategory) return null;
  return (
    t(`goonghap_gender_${subCategory}`) ||
    SUBCATEGORY_LABEL_FALLBACK[subCategory] ||
    toTitleCase(subCategory)
  );
};

export interface VoteCardProps {
  vote: import('@/types/interfaces').Vote;
  onClick?: () => void;
  isHero?: boolean;
  locale?: string;
}
