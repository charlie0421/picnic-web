import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const VOTE_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
} as const;

export const VOTE_AREAS = {
  ALL: 'all',
  KPOP: 'kpop',
  MUSICAL: 'musical',
} as const;

export type VoteStatus = (typeof VOTE_STATUS)[keyof typeof VOTE_STATUS];
export type VoteArea = (typeof VOTE_AREAS)[keyof typeof VOTE_AREAS];

// 기본값 정의
const DEFAULT_STATUS: VoteStatus = VOTE_STATUS.ONGOING;
const DEFAULT_AREA: VoteArea = VOTE_AREAS.ALL;

// 상태 검증 함수
const isValidVoteStatus = (value: any): value is VoteStatus => {
  return Object.values(VOTE_STATUS).includes(value);
};

const isValidVoteArea = (value: any): value is VoteArea => {
  return Object.values(VOTE_AREAS).includes(value);
};

interface VoteFilterState {
  selectedStatus: VoteStatus;
  selectedArea: VoteArea;
  setSelectedStatus: (status: VoteStatus) => void;
  setSelectedArea: (area: VoteArea) => void;
  resetFilters: () => void;
  validateAndFixState: () => void;
}

export const useVoteFilterStore = create<VoteFilterState>()(
  persist(
    (set, get) => ({
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
        console.log('[VoteFilterStore] Filters reset to default values');
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
          console.log('[VoteFilterStore] State validation completed with fixes');
        }
      },
    }),
    {
      name: 'vote-filter-storage',
      onRehydrateStorage: () => (state) => {
        // localStorage에서 복원된 후 상태 검증 실행
        if (state) {
          state.validateAndFixState();
        }
      },
    }
  )
); 