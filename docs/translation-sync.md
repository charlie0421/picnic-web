# 번역 동기화 시스템

이 문서는 Crowdin과 로컬 JSON 파일 간의 번역 동기화 시스템에 대해 설명합니다.

## 개요

현재 번역 시스템은 다음과 같은 **이중 구조**로 구성되어 있습니다:

1. **Crowdin OTA (Over-The-Air)**: 실시간 번역 업데이트
2. **로컬 JSON 파일**: Fallback 및 오프라인 지원

## 번역 로딩 우선순위

```
Crowdin OTA → 로컬 JSON 파일 → 기본 언어 → 키 자체 반환
```

## 동기화 방법들

### 1. 수동 API 동기화

관리자가 웹 인터페이스를 통해 수동으로 실행:

```typescript
// TranslationSyncPanel 컴포넌트 사용
<TranslationSyncPanel />
```

또는 직접 API 호출:

```bash
curl -X POST /api/translations/sync \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

### 2. 스크립트를 통한 동기화

```bash
# 기본 동기화
npm run sync-translations

# 결과를 파일로 저장하며 동기화
npm run sync-translations:save
```

### 3. GitHub Actions 자동 동기화

- **매일 오전 9시(KST)** 자동 실행
- **수동 실행** 가능 (Actions 탭에서)
- **Crowdin Webhook** 연동 시 실시간 동기화

## 환경 변수 설정

### 필수 설정

```bash
# Crowdin 배포 해시
NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH=your_hash_here

# API 인증 키 (관리자용)
TRANSLATION_SYNC_API_KEY=your_secure_key_here
```

### 선택적 설정

```bash
# Crowdin 전용 모드 (로컬 파일 무시)
NEXT_PUBLIC_CROWDIN_ONLY_MODE=false

# 동기화 결과 저장
SAVE_SYNC_RESULTS=true
```

## 동작 모드

### 1. 하이브리드 모드 (기본값)

```bash
NEXT_PUBLIC_CROWDIN_ONLY_MODE=false
```

- Crowdin + 로컬 파일 모두 사용
- 높은 안정성과 오프라인 지원
- **권장 모드**

### 2. Crowdin 전용 모드

```bash
NEXT_PUBLIC_CROWDIN_ONLY_MODE=true
```

- Crowdin OTA만 사용
- 로컬 JSON 파일 무시
- 실시간 업데이트에 최적화

## 파일 구조

```
locales/
├── ko.json     # 한국어 (기본)
├── en.json     # 영어
├── ja.json     # 일본어
├── zh.json     # 중국어
└── id.json     # 인도네시아어

scripts/
├── sync-translations.js      # 동기화 스크립트
└── last-sync-result.json    # 마지막 동기화 결과

.github/workflows/
└── sync-translations.yml    # GitHub Actions
```

## 동기화 결과 확인

동기화 후 `scripts/last-sync-result.json`에서 결과 확인:

```json
{
  "syncedAt": "2024-01-15T09:00:00.000Z",
  "totalUpdated": 250,
  "results": {
    "ko": {
      "success": true,
      "keysCount": 50,
      "updatedAt": "2024-01-15T09:00:00.000Z"
    },
    "en": {
      "success": true,
      "keysCount": 50,
      "updatedAt": "2024-01-15T09:00:00.000Z"
    }
  }
}
```

## 장애 대응

### Crowdin 서비스 장애 시

로컬 JSON 파일이 자동으로 fallback 역할을 하므로 서비스 중단 없음.

### 로컬 파일 손상 시

1. `npm run sync-translations` 실행
2. 또는 GitHub Actions에서 수동 실행
3. Crowdin에서 최신 번역 다시 다운로드

### API 키 누출 시

1. GitHub Secrets에서 `TRANSLATION_SYNC_API_KEY` 변경
2. `.env.local`에서 로컬 키 업데이트

## 모니터링

### GitHub Actions 로그

- Actions 탭에서 동기화 상태 확인
- 실패 시 자동 알림 (설정에 따라)

### API 응답 확인

```bash
# 동기화 엔드포인트 정보
curl /api/translations/sync

# 실제 동기화 실행
curl -X POST /api/translations/sync \
  -H "Authorization: Bearer YOUR_KEY"
```

## Best Practices

1. **정기적 동기화**: 최소 하루 1회
2. **로컬 백업**: 주요 번역은 Git으로 버전 관리
3. **테스트**: 번역 변경 후 빌드 테스트 실행
4. **검토**: 자동 PR을 통한 번역 변경 검토

## 트러블슈팅

### "No translations found" 에러

- Crowdin 배포 해시 확인
- 네트워크 연결 상태 확인
- Crowdin 프로젝트 상태 확인

### 권한 에러

- API 키 유효성 확인
- GitHub Secrets 설정 확인

### 파일 쓰기 에러

- 디스크 공간 확인
- 파일 권한 확인 