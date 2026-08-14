import { create } from 'zustand';

export const VOTE_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  ADMIN: 'admin',
} as const;

// 순서가 곧 UI 노출 순서다. 앱(picnic_lib vote_list_page.dart `_voteTabs`)과 동일하게 유지한다.
export const VOTE_AREAS = {
  ALL: 'all',
  KPOP: 'kpop',
  PIC_CHART: 'pic-chart',
  MUSICAL: 'musical',
  SPOTLIGHT: 'spotlight',
} as const;

export type VoteStatus = (typeof VOTE_STATUS)[keyof typeof VOTE_STATUS];
export type VoteArea = (typeof VOTE_AREAS)[keyof typeof VOTE_AREAS];

/**
 * area 탭 노출 순서와 라벨.
 *
 * 라벨은 앱과 동일하게 전 로케일 공통 영문 하드코딩이다. 앱의 `_voteTabs` 가
 * `AppLocalizations` 를 거치지 않고 고정 문자열을 쓰므로, 여기서 i18n 을 태우면
 * 같은 화면이 플랫폼마다 다른 문구로 보인다.
 */
export const VOTE_AREA_TABS: ReadonlyArray<{ area: VoteArea; label: string }> = [
  { area: VOTE_AREAS.ALL, label: 'ALL' },
  { area: VOTE_AREAS.KPOP, label: 'PICNIC' },
  { area: VOTE_AREAS.PIC_CHART, label: 'PIC CHART' },
  { area: VOTE_AREAS.MUSICAL, label: 'MUSICAL' },
  { area: VOTE_AREAS.SPOTLIGHT, label: 'SPOTLIGHT' },
];

// 기본값 정의
export const DEFAULT_STATUS: VoteStatus = VOTE_STATUS.ONGOING;
export const DEFAULT_AREA: VoteArea = VOTE_AREAS.ALL;

// 상태 검증 함수
const isValidVoteStatus = (value: any): value is VoteStatus => {
  return Object.values(VOTE_STATUS).includes(value);
};

const isValidVoteArea = (value: any): value is VoteArea => {
  return Object.values(VOTE_AREAS).includes(value);
};

/** URL 쿼리처럼 신뢰할 수 없는 입력을 유효한 값으로 좁힌다. */
export const normalizeVoteStatus = (value: unknown): VoteStatus =>
  isValidVoteStatus(value) ? value : DEFAULT_STATUS;

export const normalizeVoteArea = (value: unknown): VoteArea =>
  isValidVoteArea(value) ? value : DEFAULT_AREA;

interface VoteFilterState {
  selectedStatus: VoteStatus;
  selectedArea: VoteArea;
  setSelectedStatus: (status: VoteStatus) => void;
  setSelectedArea: (area: VoteArea) => void;
  resetFilters: () => void;
  validateAndFixState: () => void;
}

/**
 * 투표 필터 상태.
 *
 * 앱과 동일하게 **영구 저장하지 않는다**. 앱의 `_VoteListContentState` 는
 * 매 진입마다 `_selectedTab = 0`(ALL) · `_status = active`(진행중) 로 시작한다.
 * 웹의 실제 필터 진실은 URL 쿼리(`?status=&area=`)이며, 이 스토어는 그 값을
 * 공유하지 않는 컴포넌트(예: 빈 상태 문구)를 위한 기본값 보관소일 뿐이다.
 */
export const useVoteFilterStore = create<VoteFilterState>()((set, get) => ({
  selectedStatus: DEFAULT_STATUS,
  selectedArea: DEFAULT_AREA,
  setSelectedStatus: (status) => {
    if (isValidVoteStatus(status)) {
      set({ selectedStatus: status });
    } else {
      console.warn('[VoteFilterStore] Invalid status provided:', status, 'Using default:', DEFAULT_STATUS);
      set({ selectedStatus: DEFAULT_STATUS });
    }
  },
  setSelectedArea: (area) => {
    if (isValidVoteArea(area)) {
      set({ selectedArea: area });
    } else {
      console.warn('[VoteFilterStore] Invalid area provided:', area, 'Using default:', DEFAULT_AREA);
      set({ selectedArea: DEFAULT_AREA });
    }
  },
  resetFilters: () => {
    set({
      selectedStatus: DEFAULT_STATUS,
      selectedArea: DEFAULT_AREA
    });
  },
  validateAndFixState: () => {
    const state = get();
    let hasInvalidState = false;
    const newState: Partial<{ selectedStatus: VoteStatus; selectedArea: VoteArea }> = {};

    if (!isValidVoteStatus(state.selectedStatus)) {
      newState.selectedStatus = DEFAULT_STATUS;
      hasInvalidState = true;
      console.warn('[VoteFilterStore] Invalid selectedStatus detected:', state.selectedStatus, 'Fixed to:', DEFAULT_STATUS);
    }

    if (!isValidVoteArea(state.selectedArea)) {
      newState.selectedArea = DEFAULT_AREA;
      hasInvalidState = true;
      console.warn('[VoteFilterStore] Invalid selectedArea detected:', state.selectedArea, 'Fixed to:', DEFAULT_AREA);
    }

    if (hasInvalidState) {
      set(newState);
    }
  },
}));
