# 🔄 Vercel 환경변수 스마트 동기화 가이드

로컬 `.env` 파일을 편집하고 변경사항만 Vercel에 자동 반영하는 완전 자동화된 솔루션입니다.

## 🚀 빠른 시작

### 기본 사용법

```bash
# Development 환경 동기화
./scripts/env-sync dev

# Production 환경 동기화  
./scripts/env-sync prod

# 모든 환경 동기화
./scripts/env-sync all
```

### 고급 옵션

```bash
# 미리보기 (실제 변경 없음)
./scripts/env-sync --dry-run dev

# 상세 출력
./scripts/env-sync --verbose dev

# 강제 업데이트 (기존 값 덮어쓰기)
./scripts/env-sync --force prod

# 파일 변경 감지 모드 (자동 동기화)
./scripts/env-sync --watch
```

## 📋 동작 원리

### 1. **캐시 기반 비교**
- Vercel의 현재 환경변수 상태를 캐시 파일에 저장
- 로컬 `.env` 파일과 캐시 비교하여 차이점만 식별

### 2. **스마트 변경 감지**
- **➕ 신규**: 로컬에만 있는 변수
- **🔄 변경**: 이미 존재하는 변수 (값 업데이트)
- **🗑️ 제거**: Vercel에만 있는 변수 (로컬에서 삭제됨)

### 3. **선택적 적용**
- 사용자 확인 후 변경사항만 Vercel에 반영
- API 제한을 고려한 속도 조절

## 🎯 워크플로우 예시

### 일반적인 개발 과정

```bash
# 1. 로컬에서 .env.local 파일 편집
vim .env.local

# 2. 변경사항 미리보기
./scripts/env-sync --dry-run dev

# 3. 실제 동기화
./scripts/env-sync dev

# 4. 결과 확인
vercel env ls | grep Development
```

### 프로덕션 배포 과정

```bash
# 1. .env.production 파일 업데이트
vim .env.production

# 2. 변경사항 확인
./scripts/env-sync --dry-run prod

# 3. 프로덕션에 적용
./scripts/env-sync --force prod

# 4. 배포
vercel --prod
```

## 🔧 파일 변경 감지 모드

### 자동 동기화 설정

```bash
# fswatch 설치 (macOS)
brew install fswatch

# 자동 감지 모드 시작
./scripts/env-sync --watch
```

이 모드에서는:
- `.env.local`, `.env.preview`, `.env.production` 파일 변경 감지
- 파일이 변경되면 해당 환경에 자동 동기화
- `Ctrl+C`로 종료

## 📁 파일 구조

```
프로젝트/
├── .env.local          # Development 환경
├── .env.preview        # Preview 환경
├── .env.production     # Production 환경
├── .vercel-env-cache/  # 동기화 캐시 (자동 생성)
│   ├── development.cache
│   ├── preview.cache
│   └── production.cache
└── scripts/
    ├── env-sync        # 간편 실행 스크립트
    └── vercel-env-sync.sh  # 메인 스크립트
```

## 🎨 출력 예시

```bash
$ ./scripts/env-sync dev

🔄 Vercel 환경변수 스마트 동기화
=================================

📁 development 환경 동기화 (.env.local)
📋 development 환경 현재 상태 캐싱...

🔍 development 환경 변경사항 분석...
📊 변경사항 요약:
   ➕ 신규: 2개
   🔄 변경: 1개
   🗑️ 제거: 0개

🚀 development 환경에 변경사항 적용 중...
   🔄 처리 중: NEW_API_KEY
   ✅ NEW_API_KEY 성공
   🔄 처리 중: UPDATED_SECRET
   ✅ UPDATED_SECRET 성공

📊 적용 결과:
   ✅ 성공: 3개

✅ 동기화 완료!
🌐 Vercel 대시보드: https://vercel.com/dashboard
```

## 🛡️ 안전 기능

### 1. **Dry Run 모드**
- `--dry-run` 옵션으로 실제 변경 없이 미리보기
- 프로덕션 환경 변경 전 항상 사용 권장

### 2. **캐시 시스템**
- Vercel API 호출 최소화
- 빠른 차이점 분석
- `.vercel-env-cache/` 디렉토리에 저장

### 3. **에러 처리**
- Vercel 로그인 상태 확인
- 파일 존재 여부 검증
- API 제한 고려한 속도 조절

## 🚨 주의사항

### 1. **민감한 정보**
- 환경변수 파일은 절대 Git에 커밋하지 마세요
- `.gitignore`에 포함되어 있는지 확인

### 2. **프로덕션 환경**
- 프로덕션 변경 시 `--dry-run`으로 먼저 확인
- 중요한 변경은 팀과 공유 후 진행

### 3. **캐시 관리**
- 문제 발생 시 `.vercel-env-cache/` 삭제 후 재시도
- 캐시는 자동으로 관리되므로 일반적으로 신경 쓸 필요 없음

## 🔗 관련 명령어

```bash
# 현재 Vercel 환경변수 확인
vercel env ls

# 특정 환경변수 수동 추가
echo "value" | vercel env add KEY_NAME development

# 환경변수 삭제
vercel env remove KEY_NAME --yes

# Vercel 로그인 상태 확인
vercel whoami
```

## 🆚 기존 스크립트와 비교

| 기능 | `env-sync` | 기존 스크립트 |
|------|------------|---------------|
| **차이점만 동기화** | ✅ | ❌ |
| **캐시 기반 비교** | ✅ | ❌ |
| **파일 변경 감지** | ✅ | ❌ |
| **Dry Run 모드** | ✅ | ✅ |
| **속도** | 🚀 빠름 | 🐌 느림 |
| **API 호출** | 최소화 | 많음 |
| **사용 편의성** | 🎯 높음 | 📋 보통 |

---

**이제 로컬에서 `.env` 파일만 편집하면 Vercel이 자동으로 동기화됩니다! 🎉** 