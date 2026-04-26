#!/bin/bash

# 개발 서버 관리 스크립트
# 이전 프로세스를 완전히 정리하고 새로운 개발 서버를 시작합니다.
# 다른 프로젝트에서도 재사용 가능합니다.

# 기본 설정값
DEFAULT_PORT=3100
DEFAULT_PROJECT_NAME=$(basename "$(pwd)")

# .env.local 로드 (있으면)
if [ -f ".env.local" ]; then
    set -a
    . ./.env.local
    set +a
fi

# 포트 설정 (우선순위: 명령행 인수 > 환경변수(DEV_PORT, PORT) > 기본값)
DEV_PORT=${DEV_PORT:-${PORT:-$DEFAULT_PORT}}
PROJECT_NAME=${PROJECT_NAME:-$DEFAULT_PROJECT_NAME}

# 명령행 인수 처리
CLEAR_CACHE=false
START_SERVER=false
SHOW_HELP=false

for arg in "$@"; do
    case $arg in
        --port=*)
            DEV_PORT="${arg#*=}"
            shift
            ;;
        --project=*)
            PROJECT_NAME="${arg#*=}"
            shift
            ;;
        --clear-cache)
            CLEAR_CACHE=true
            shift
            ;;
        --start)
            START_SERVER=true
            shift
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        *)
            # 이전 버전 호환성을 위해 첫 번째 인수가 --clear-cache나 --start인 경우 처리
            if [ "$arg" = "--clear-cache" ]; then
                CLEAR_CACHE=true
            elif [ "$arg" = "--start" ]; then
                START_SERVER=true
            fi
            shift
            ;;
    esac
done

# 도움말 표시
if [ "$SHOW_HELP" = true ]; then
    echo "🔧 개발 서버 관리 스크립트"
    echo ""
    echo "사용법:"
    echo "  $0 [옵션]"
    echo ""
    echo "옵션:"
    echo "  --port=PORT        개발 서버 포트 (기본값: $DEFAULT_PORT)"
    echo "  --project=NAME     프로젝트 이름 (기본값: 현재 폴더명)"
    echo "  --clear-cache      Next.js 캐시 정리"
    echo "  --start            프로세스 정리 후 개발 서버 시작"
    echo "  --help, -h         이 도움말 표시"
    echo ""
    echo "환경변수:"
    echo "  DEV_PORT          개발 서버 포트 (PORT보다 우선)"
    echo "  PORT              개발 서버 포트 (.env.local 에서 로드 가능)"
    echo "  PROJECT_NAME      프로젝트 이름"
    echo ""
    echo "예시:"
    echo "  $0                                    # 프로세스만 정리"
    echo "  $0 --start                           # 기본 포트(3100)로 시작"
    echo "  $0 --port=3000 --start              # 포트 3000으로 시작"
    echo "  $0 --clear-cache --start            # 캐시 정리 후 시작"
    echo "  DEV_PORT=4000 $0 --start            # 환경변수로 포트 설정"
    exit 0
fi

echo "🔧 개발 서버 관리자 시작..."
echo "📊 설정 정보:"
echo "   📍 프로젝트: $PROJECT_NAME"
echo "   🚪 포트: $DEV_PORT"

# 현재 작업 디렉토리 확인
PROJECT_DIR=$(pwd)
echo "📍 프로젝트 디렉토리: $PROJECT_DIR"

# 1. 지정된 포트를 사용하는 모든 프로세스 종료
echo "🔍 포트 $DEV_PORT 사용 프로세스 확인 및 종료..."
PORT_PIDS=$(lsof -ti:$DEV_PORT 2>/dev/null || true)
if [ ! -z "$PORT_PIDS" ]; then
    echo "   포트 $DEV_PORT 사용 프로세스 발견: $PORT_PIDS"
    kill -9 $PORT_PIDS 2>/dev/null || true
    echo "   ✅ 포트 $DEV_PORT 프로세스 종료 완료"
else
    echo "   ℹ️  포트 $DEV_PORT 사용 프로세스 없음"
fi

# 2. Next.js 관련 모든 프로세스 종료
echo "🔍 Next.js 관련 프로세스 확인 및 종료..."
NEXT_PIDS=$(ps aux | grep -E "(next|npm.*dev)" | grep -v grep | grep "$PROJECT_NAME" | awk '{print $2}' || true)
if [ ! -z "$NEXT_PIDS" ]; then
    echo "   Next.js 프로세스 발견: $NEXT_PIDS"
    for pid in $NEXT_PIDS; do
        echo "   프로세스 $pid 종료 중..."
        kill -TERM $pid 2>/dev/null || true
        sleep 1
        kill -9 $pid 2>/dev/null || true
    done
    echo "   ✅ Next.js 프로세스 종료 완료"
else
    echo "   ℹ️  Next.js 프로세스 없음"
fi

# 3. Node.js 프로세스 중 현재 프로젝트 관련 프로세스 정리
echo "🔍 프로젝트 관련 Node.js 프로세스 확인..."
NODE_PIDS=$(ps aux | grep "node" | grep "$PROJECT_DIR" | grep -v grep | awk '{print $2}' || true)
if [ ! -z "$NODE_PIDS" ]; then
    echo "   프로젝트 관련 Node.js 프로세스 발견: $NODE_PIDS"
    for pid in $NODE_PIDS; do
        echo "   프로세스 $pid 종료 중..."
        kill -TERM $pid 2>/dev/null || true
        sleep 1
        kill -9 $pid 2>/dev/null || true
    done
    echo "   ✅ 프로젝트 Node.js 프로세스 종료 완료"
else
    echo "   ℹ️  프로젝트 관련 Node.js 프로세스 없음"
fi

# 4. Next.js 캐시 정리 (선택적)
if [ "$CLEAR_CACHE" = true ]; then
    echo "🧹 Next.js 캐시 정리..."
    if [ -d ".next" ]; then
        rm -rf .next
        echo "   ✅ .next 폴더 삭제 완료"
    fi
    if [ -d "node_modules/.cache" ]; then
        rm -rf node_modules/.cache
        echo "   ✅ Node.js 캐시 삭제 완료"
    fi
fi

# 5. 프로세스 완전 종료 대기
echo "⏳ 프로세스 완전 종료 대기 (3초)..."
sleep 3

# 6. 포트 최종 확인
echo "🔍 포트 $DEV_PORT 최종 상태 확인..."
if lsof -i:$DEV_PORT &>/dev/null; then
    echo "   ⚠️  포트 $DEV_PORT이 여전히 사용 중입니다"
    lsof -i:$DEV_PORT
    echo "   🔧 강제 정리 시도..."
    lsof -ti:$DEV_PORT | xargs kill -9 2>/dev/null || true
    sleep 2
else
    echo "   ✅ 포트 $DEV_PORT 완전히 해제됨"
fi

# 7. 개발 서버 시작 (--start 옵션이 있는 경우)
if [ "$START_SERVER" = true ]; then
    echo "🚀 새로운 개발 서버 시작..."
    echo "📄 환경 변수 로드 확인..."
    if [ -f ".env.local" ]; then
        echo "   ✅ .env.local 파일 발견"
    else
        echo "   ⚠️  .env.local 파일이 없습니다"
    fi
    
    echo "🎬 Next.js 개발 서버 시작 중 (포트 $DEV_PORT)..."
    exec next dev --port $DEV_PORT
else
    echo "✅ 프로세스 정리 완료"
    echo "💡 개발 서버를 시작하려면:"
    echo "   ./scripts/dev-server-manager.sh --start"
    echo "   또는 DEV_PORT=$DEV_PORT ./scripts/dev-server-manager.sh --start"
    echo "💡 다른 포트로 시작하려면:"
    echo "   ./scripts/dev-server-manager.sh --port=3000 --start"
    echo "💡 캐시와 함께 정리하려면:"
    echo "   ./scripts/dev-server-manager.sh --clear-cache --start"
fi 