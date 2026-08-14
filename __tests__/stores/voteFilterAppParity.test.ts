import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useVoteFilterStore,
  VOTE_AREAS,
  VOTE_AREA_TABS,
  VOTE_STATUS,
  normalizeVoteArea,
  normalizeVoteStatus,
} from '@/stores/voteFilterStore'
import { shouldOrderByArea } from '@/lib/vote/vote-order'

/**
 * 앱(picnic_lib)의 투표 리스트 필터와 웹을 같은 계약으로 묶어두는 테스트.
 *
 * 기준은 `picnic_lib/lib/presentation/pages/vote/vote_list_page.dart` 의 `_voteTabs`,
 * `_buildStatusDropdown` 과 `presentation/providers/vote_list_provider.dart` 의 정렬 분기다.
 * 앱이 바뀌면 여기가 먼저 깨져야 한다.
 */
describe('앱 투표 필터 동기화', () => {
  describe('area 탭 — 앱 _voteTabs 와 동일', () => {
    it('항목과 순서가 앱과 같다', () => {
      expect(VOTE_AREA_TABS.map((tab) => tab.area)).toEqual([
        'all',
        'kpop',
        'pic-chart',
        'musical',
        'spotlight',
      ])
    })

    it('라벨이 앱과 같다 (전 로케일 공통 영문 고정)', () => {
      expect(VOTE_AREA_TABS.map((tab) => tab.label)).toEqual([
        'ALL',
        'PICNIC',
        'PIC CHART',
        'MUSICAL',
        'SPOTLIGHT',
      ])
    })

    it('spotlight 가 유효한 area 다', () => {
      expect(VOTE_AREAS.SPOTLIGHT).toBe('spotlight')
      expect(normalizeVoteArea('spotlight')).toBe('spotlight')
    })

    it('VOTE_AREA_TABS 와 VOTE_AREAS 가 어긋나지 않는다', () => {
      expect([...VOTE_AREA_TABS.map((tab) => tab.area)].sort()).toEqual(
        Object.values(VOTE_AREAS).slice().sort(),
      )
    })
  })

  describe('알 수 없는 URL 값 정규화', () => {
    it('모르는 area 는 all 로 좁힌다', () => {
      expect(normalizeVoteArea('novel')).toBe('all')
      expect(normalizeVoteArea(null)).toBe('all')
      expect(normalizeVoteArea(undefined)).toBe('all')
    })

    it('모르는 status 는 ongoing 으로 좁힌다', () => {
      expect(normalizeVoteStatus('bogus')).toBe('ongoing')
      expect(normalizeVoteStatus(null)).toBe('ongoing')
    })

    it('유효한 값은 그대로 통과한다', () => {
      expect(normalizeVoteArea('pic-chart')).toBe('pic-chart')
      expect(normalizeVoteStatus('completed')).toBe('completed')
    })
  })

  describe('필터를 저장하지 않는다 — 앱과 동일', () => {
    let setItemSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      // jsdom 에서는 인스턴스가 아니라 Storage.prototype 에 스파이를 걸어야 가로챈다.
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    })

    afterEach(() => {
      setItemSpy.mockRestore()
      useVoteFilterStore.getState().resetFilters()
    })

    it('필터를 바꿔도 localStorage 에 쓰지 않는다', () => {
      useVoteFilterStore.getState().setSelectedArea(VOTE_AREAS.SPOTLIGHT)
      useVoteFilterStore.getState().setSelectedStatus(VOTE_STATUS.COMPLETED)

      const wroteFilterKey = setItemSpy.mock.calls.some(
        ([key]) => typeof key === 'string' && key.includes('vote-filter'),
      )
      expect(wroteFilterKey).toBe(false)
    })

    it('기본값은 진행중 + 전체다', () => {
      useVoteFilterStore.getState().resetFilters()
      const state = useVoteFilterStore.getState()
      expect(state.selectedStatus).toBe(VOTE_STATUS.ONGOING)
      expect(state.selectedArea).toBe(VOTE_AREAS.ALL)
    })
  })

  describe('area 우선 정렬 — 앱은 debug(=admin) 목록에서만 적용한다', () => {
    it('admin + 전체 탭에서만 참이다', () => {
      expect(shouldOrderByArea(VOTE_STATUS.ADMIN, VOTE_AREAS.ALL)).toBe(true)
      expect(shouldOrderByArea(VOTE_STATUS.ADMIN, undefined)).toBe(true)
    })

    it('admin 이어도 특정 area 탭이면 적용하지 않는다', () => {
      expect(shouldOrderByArea(VOTE_STATUS.ADMIN, VOTE_AREAS.KPOP)).toBe(false)
      expect(shouldOrderByArea(VOTE_STATUS.ADMIN, VOTE_AREAS.SPOTLIGHT)).toBe(false)
    })

    it('일반 상태 탭에는 적용하지 않는다 — 앱의 finalSort 가 stop_at/start_at 이라 area 정렬이 붙지 않는다', () => {
      expect(shouldOrderByArea(VOTE_STATUS.ONGOING, VOTE_AREAS.ALL)).toBe(false)
      expect(shouldOrderByArea(VOTE_STATUS.UPCOMING, VOTE_AREAS.ALL)).toBe(false)
      expect(shouldOrderByArea(VOTE_STATUS.COMPLETED, VOTE_AREAS.ALL)).toBe(false)
      expect(shouldOrderByArea(undefined, VOTE_AREAS.ALL)).toBe(false)
    })
  })
})
