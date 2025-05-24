# Vote 도메인 마이그레이션 상태

## 현재 사용 중인 컴포넌트

### App 라우트에서 직접 사용
1. `Menu` - app/[lang]/(main)/layout.tsx
2. `VotePopup` - app/[lang]/(main)/layout.tsx  
3. `BannerList` - app/[lang]/(main)/vote/VotePageClient.tsx (✅ 마이그레이션 완료)
4. `VoteList` - components/shared/VoteList (shared 폴더에 있음)

### 마이그레이션 완료 (98%)
- ✅ types.ts, utils.ts
- ✅ server/VoteListFetcher
- ✅ server/VoteDetailFetcher
- ✅ server/BannerListFetcher
- ✅ client/VoteTimer
- ✅ client/VoteSearch
- ✅ client/VoteButton
- ✅ client/VoteListPresenter
- ✅ client/VoteDetailPresenter
- ✅ client/VoteRankCard
- ✅ client/BannerList
- ✅ client/BannerItem
- ✅ client/BannerListWrapper
- ✅ client/OngoingVoteItems (이동 완료)
- ✅ client/CompletedVoteItems (이동 완료)
- ✅ common/VoteStatus
- ✅ common/VoteCard

### 관련 import 경로 수정
- ✅ app/[lang]/(main)/vote/VotePageClient.tsx - BannerListWrapper 사용
- ✅ components/client/VoteItems.tsx - OngoingVoteItems, CompletedVoteItems 경로 수정
- ✅ components/shared/VoteDetail/VoteDetailClient.tsx - OngoingVoteItems 경로 수정

### 마이그레이션 필요 (2%)
1. **list 폴더** (별도 구현들)
   - VoteCard.tsx (common의 VoteCard와 다른 구현)
   - VoteFilterSection.tsx
   - VoteStatusFilter.tsx
   - VoteAreaFilter.tsx
   - VoteListSection.tsx
   - VoteFilterSectionWrapper.tsx
   - VotePagination.tsx
   - VoteInfiniteLoading.tsx
   - VoteLoadingSkeleton.tsx
   - VoteEmptyState.tsx

2. **dialogs 폴더**
   - VoteDialog.tsx
   - LoginDialog.tsx
   - VotePopup.tsx (사용 중)

3. **기타**
   - Menu.tsx (사용 중)
   - CurrentTime.tsx
   - VoteRewardPreview.tsx
   - UpcomingVoteItems.tsx

## 권장 사항
1. 사용 중인 컴포넌트(Menu, VotePopup)는 점진적으로 마이그레이션
2. list 폴더의 VoteCard는 이름 변경 필요 (예: VoteListCard)
3. shared/VoteList는 features/vote로 이동 고려
4. OngoingVoteItems와 CompletedVoteItems의 타입 호환성 문제 해결 필요 