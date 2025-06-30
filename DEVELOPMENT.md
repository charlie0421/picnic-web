# 🚀 개발 서버 관리 가이드

이 프로젝트는 **완전 자동화된 개발 서버 관리 시스템**을 제공합니다. 기존 프로세스가 남아서 생기는 문제들을 완벽하게 해결하고, **다른 웹 프로젝트에서도 재사용할 수 있습니다**.

## 📋 주요 기능

- ✅ **포트별 프로세스 완전 정리**: 지정된 포트의 모든 프로세스 안전 종료
- ✅ **Next.js 프로세스 격리 정리**: 프로젝트별 Next.js 프로세스만 정리
- ✅ **Node.js 프로세스 안전 관리**: 다른 프로젝트에 영향 없이 현재 프로젝트만 정리
- ✅ **선택적 캐시 정리**: 필요할 때만 .next 및 Node.js 캐시 삭제
- ✅ **환경 변수 자동 확인**: .env.local 파일 존재 여부 확인
- ✅ **안전한 프로세스 종료**: TERM → KILL 단계적 종료로 데이터 손실 방지
- ✅ **포트 설정 유연성**: 환경변수 또는 명령행으로 포트 변경 가능
- ✅ **다중 프로젝트 지원**: 프로젝트명과 포트를 자동 감지하여 격리 관리

## 🎯 빠른 시작

### 기본 사용법 (포트 3100)
```bash
# 평상시 개발 (추천)
npm run dev

# 문제가 있을 때 (캐시 정리 포함)
npm run dev:clean

# 개발 서버만 정리
npm run dev:stop
```

### 다른 포트로 개발
```bash
# 포트 3000으로 개발
npm run dev:3000

# 포트 3001로 개발  
npm run dev:3001

# 포트 4000으로 개발
npm run dev:4000

# 사용자 정의 포트로 개발
./scripts/dev-server-manager.sh --port=5000 --start

# 환경변수로 포트 설정
DEV_PORT=8080 npm run dev
```

## 🔧 고급 사용법

### 스크립트 직접 사용
```bash
# 도움말 보기
./scripts/dev-server-manager.sh --help
npm run dev:help

# 프로세스만 정리 (서버 시작 안함)
./scripts/dev-server-manager.sh

# 포트 3000, 캐시 정리, 서버 시작
./scripts/dev-server-manager.sh --port=3000 --clear-cache --start

# 프로젝트명 지정 (다른 프로젝트에서 사용시)
./scripts/dev-server-manager.sh --project=my-app --port=3000 --start
```

### 환경변수 사용
```bash
# 포트 설정
export DEV_PORT=4000
npm run dev

# 프로젝트명 설정 (다른 프로젝트에서 사용시)
export PROJECT_NAME=my-custom-app
export DEV_PORT=3000
./scripts/dev-server-manager.sh --start
```

## 🔄 다른 프로젝트에서 재사용하기

이 스크립트는 **범용적으로 설계**되어 다른 Next.js 프로젝트에서도 사용할 수 있습니다:

### 1. 스크립트 복사
```bash
# 다른 프로젝트에 스크립트 복사
cp /path/to/picnic-web/scripts/dev-server-manager.sh ./scripts/
chmod +x ./scripts/dev-server-manager.sh
```

### 2. package.json 설정
```json
{
  "scripts": {
    "dev": "./scripts/dev-server-manager.sh --start",
    "dev:clean": "./scripts/dev-server-manager.sh --clear-cache --start",
    "dev:stop": "./scripts/dev-server-manager.sh",
    "dev:3000": "./scripts/dev-server-manager.sh --port=3000 --start",
    "dev:help": "./scripts/dev-server-manager.sh --help"
  }
}
```

### 3. 프로젝트별 설정
```bash
# React 프로젝트 (포트 3000)
DEV_PORT=3000 PROJECT_NAME=my-react-app ./scripts/dev-server-manager.sh --start

# Vue 프로젝트 (포트 8080) - Next.js 부분은 자동으로 스킵됨
DEV_PORT=8080 PROJECT_NAME=my-vue-app ./scripts/dev-server-manager.sh

# Express 서버 (포트 5000)
DEV_PORT=5000 PROJECT_NAME=my-api-server ./scripts/dev-server-manager.sh
```

## 📊 사용 가능한 npm 스크립트

| 명령어 | 설명 | 포트 |
|--------|------|------|
| `npm run dev` | 기본 개발 서버 시작 | 3100 |
| `npm run dev:clean` | 캐시 정리 후 개발 서버 시작 | 3100 |
| `npm run dev:stop` | 개발 서버만 정리 (시작 안함) | 3100 |
| `npm run dev:3000` | 포트 3000으로 개발 서버 시작 | 3000 |
| `npm run dev:3001` | 포트 3001로 개발 서버 시작 | 3001 |
| `npm run dev:4000` | 포트 4000으로 개발 서버 시작 | 4000 |
| `npm run dev:help` | 스크립트 도움말 표시 | - |
| `npm run dev:legacy` | 기존 방식 (백업용) | 3100 |

## 🛡️ 안전성 특징

### 프로세스 안전 종료
1. **TERM 시그널**: 프로세스에게 정상 종료 기회 제공
2. **1초 대기**: 정상 종료 완료 대기
3. **KILL 시그널**: 필요시 강제 종료
4. **3초 대기**: 프로세스 완전 종료 확인

### 프로젝트 격리
- 현재 프로젝트 디렉토리 기반으로 프로세스 필터링
- 다른 프로젝트의 Node.js 프로세스에 영향 없음
- 프로젝트명 기반 Next.js 프로세스 격리

### 포트 충돌 방지
- 지정된 포트만 정리하여 다른 서비스에 영향 없음
- 포트별 독립적인 프로세스 관리
- 최종 포트 상태 확인 및 강제 정리

## 🐛 문제 해결

### 일반적인 문제들

**1. 포트가 여전히 사용 중인 경우**
```bash
# 수동으로 포트 확인
lsof -i :3100

# 강제 정리 후 재시도
./scripts/dev-server-manager.sh --port=3100
./scripts/dev-server-manager.sh --port=3100 --start
```

**2. 권한 문제**
```bash
# 스크립트 실행 권한 확인
chmod +x ./scripts/dev-server-manager.sh
```

**3. 환경변수가 적용되지 않는 경우**
```bash
# .env.local 파일 확인
ls -la .env.local

# 환경변수 직접 설정
export DEV_PORT=3000
npm run dev
```

**4. 캐시 문제**
```bash
# 강력한 캐시 정리
npm run dev:clean

# 수동 캐시 정리
rm -rf .next node_modules/.cache
npm run dev
```

**5. 여러 프로젝트 충돌**
```bash
# 프로젝트별 고유 포트 사용
DEV_PORT=3100 npm run dev  # picnic-web
DEV_PORT=3000 npm run dev  # other-project-1  
DEV_PORT=4000 npm run dev  # other-project-2
```

### 고급 디버깅

**프로세스 상태 확인**
```bash
# 모든 Node.js 프로세스 확인
ps aux | grep node

# 특정 포트 사용 프로세스 확인
lsof -i :3100

# Next.js 프로세스만 확인
ps aux | grep next
```

**스크립트 동작 상세 확인**
```bash
# 디버그 모드로 실행 (bash -x)
bash -x ./scripts/dev-server-manager.sh --start

# 단계별 실행
./scripts/dev-server-manager.sh          # 1. 정리만
./scripts/dev-server-manager.sh --start  # 2. 정리 후 시작
```

## 💡 팁과 모범 사례

### 개발 워크플로우
1. **작업 시작**: `npm run dev`
2. **문제 발생시**: `npm run dev:clean`  
3. **작업 종료**: `npm run dev:stop` (선택사항)

### 멀티 프로젝트 환경
```bash
# 각 프로젝트마다 고유 포트 사용
# project-1: 포트 3000
# project-2: 포트 3001  
# project-3: 포트 3002
```

### CI/CD 환경
```bash
# CI에서 사용시 환경변수로 포트 지정
DEV_PORT=${CI_PORT:-3100} ./scripts/dev-server-manager.sh --start
```

## 🔄 업그레이드 및 마이그레이션

기존 프로젝트에서 이 시스템으로 마이그레이션하려면:

1. **스크립트 복사**: `dev-server-manager.sh` 복사
2. **package.json 업데이트**: dev 스크립트 변경
3. **기존 프로세스 정리**: `npm run dev:stop`
4. **새 시스템 사용**: `npm run dev`

---

**이제 개발 서버 관리 걱정 없이 개발에 집중하세요!** 🚀 