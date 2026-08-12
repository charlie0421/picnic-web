// voting-v2 계약 상한 (Postgres int4). BFF와 UI가 반드시 같은 값을 사용해야
// UI가 서버 상한보다 큰 amount 를 "전체 사용"으로 만들어 400을 유발하지 않는다.
export const MAX_VOTE_AMOUNT = 2147483647;
