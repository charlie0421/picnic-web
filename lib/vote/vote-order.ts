import { VOTE_AREAS, VOTE_STATUS } from '@/stores/voteFilterStore';

/**
 * 투표 목록을 area 오름차순으로 먼저 묶을지 여부.
 *
 * 앱 `vote_list_provider.dart` 는 `area == 'all' && finalSort == 'id'` 일 때만
 * `order('area', ascending: true)` 를 붙인다. `finalSort` 가 'id' 로 남는 경우는
 * debug 상태(=웹의 admin)뿐이고, 진행중/예정/종료는 각각 stop_at·start_at 으로
 * 덮어써지므로 area 정렬이 붙지 않는다. 같은 조건을 그대로 옮겼다.
 *
 * 서버 쿼리(`lib/data-fetching/server/vote-service-query.ts`)와 클라이언트 쿼리
 * (`lib/data-fetching/client/vote-service.client.ts`), API 라우트가 모두 이 함수를
 * 쓴다. 서버 전용 모듈에 두면 클라이언트 번들과 테스트가 `server-only` 를 끌어와
 * 깨지므로 여기 별도 모듈에 둔다.
 */
export const shouldOrderByArea = (status?: string, area?: string): boolean =>
  status === VOTE_STATUS.ADMIN && (!area || area === VOTE_AREAS.ALL);
