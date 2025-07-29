# API 설계 문서

이 문서는 클라이언트 사이드 Supabase 접근을 대체하기 위한 새로운 백엔드 API의 구조를 정의합니다.

## 1. 기본 원칙

- **RESTful**: API는 REST 원칙을 따릅니다.
- **Stateless**: 각 API 요청은 독립적이며, 필요한 모든 정보를 포함해야 합니다. 인증은 쿠키 기반 세션을 통해 처리됩니다.
- **JSON**: 요청 본문과 응답은 JSON 형식을 사용합니다.
- **Prefix**: 모든 API 경로는 `/api` 접두사를 가집니다. (예: `/api/auth/login`)
- **Versioning**: 초기 버전은 v1으로 하며, 향후 변경을 위해 경로에 버전을 포함하는 것을 고려합니다. (예: `/api/v1/users/me`)

## 2. API 엔드포인트 설계

### 2.1. 인증 (Authentication) - `/api/auth`

| HTTP Method | 경로 | 설명 | 요청 본문 | 응답 (성공) | 인증 필요 |
|---|---|---|---|---|---|
| `POST` | `/login` | 이메일/패스워드 또는 소셜 로그인을 처리합니다. | `{ type: 'password' \| 'oauth', provider?: 'google' \| 'kakao', email?: string, password?: string }` | `200 OK` 사용자 정보 | 아니요 |
| `POST` | `/logout` | 사용자를 로그아웃 처리하고 세션을 종료합니다. | (없음) | `204 No Content` | 예 |
| `GET` | `/session` | 현재 사용자 세션 정보를 반환합니다. | (없음) | `200 OK` 사용자 정보 또는 `null` | 아니요 |
| `GET` | `/callback` | 소셜 로그인 후 리디렉션되는 콜백을 처리합니다. | (쿼리 파라미터) | `302 Found` (홈으로 리디렉션) | 아니요 |

### 2.2. 사용자 (Users) - `/api/users`

| HTTP Method | 경로 | 설명 | 요청 본문 | 응답 (성공) | 인증 필요 |
|---|---|---|---|---|---|
| `GET` | `/me` | 현재 로그인된 사용자의 상세 정보를 가져옵니다. | (없음) | `200 OK` 사용자 프로필 | 예 |
| `PATCH` | `/me` | 현재 로그인된 사용자의 프로필을 수정합니다. | `{ nickname?: string, avatarUrl?: string }` | `200 OK` 업데이트된 프로필 | 예 |
| `GET` | `/:userId/profile` | 특정 사용자의 공개 프로필을 가져옵니다. | (없음) | `200 OK` 공개 프로필 | 아니요 |

### 2.3. 투표 (Votes) - `/api/votes`

| HTTP Method | 경로 | 설명 | 요청 본문 | 응답 (성공) | 인증 필요 |
|---|---|---|---|---|---|
| `GET` | `/` | 모든 투표 목록을 페이지네이션하여 가져옵니다. | (쿼리 파라미터: `page`, `limit`, `filter`) | `200 OK` 투표 목록 | 아니요 |
| `GET` | `/:voteId` | 특정 투표의 상세 정보를 가져옵니다. | (없음) | `200 OK` 투표 상세 정보 | 아니요 |
| `POST` | `/:voteId/participate` | 특정 투표에 참여(투표)합니다. | `{ choiceId: string }` | `201 Created` 투표 결과 | 예 |
| `GET` | `/me` | 내가 참여한 투표 목록을 가져옵니다. | (쿼리 파라미터: `page`, `limit`) | `200 OK` 투표 목록 | 예 |

### 2.4. 충전 내역 (Recharge History) - `/api/user/recharge-history`

| HTTP Method | 경로 | 설명 | 요청 본문 | 응답 (성공) | 인증 필요 |
|---|---|---|---|---|---|
| `GET` | `/` | 현재 사용자의 충전 내역을 페이지네이션하여 가져옵니다. | (쿼리 파라미터: `page`, `limit`) | `200 OK` 충전 내역 목록 | 예 |

## 3. 에러 처리

- 표준 HTTP 상태 코드를 사용하여 결과를 나타냅니다. (예: `200 OK`, `201 Created`, `400 Bad Request`, `401 Unauthorized`, `404 Not Found`, `500 Internal Server Error`)
- 에러 응답 본문은 일관된 형식을 가집니다: `{ "error": { "message": "...", "code": "..." } }`

## 4. 기존 클라이언트 호출 -> API 매핑

| 기존 Supabase 호출 (클라이언트) | 신규 API 엔드포인트 | 비고 |
|---|---|---|
| `supabase.auth.getUser()` | `GET /api/auth/session` | |
| `supabase.auth.signInWith...()` | `POST /api/auth/login` | |
| `supabase.auth.signOut()` | `POST /api/auth/logout` | |
| `supabase.from('profiles').select().eq('id', ...)` | `GET /api/users/me` 또는 `GET /api/users/:userId/profile` | |
| `supabase.from('votes').select()` | `GET /api/votes` | |
| ... | ... | (계속 추가 예정) | 