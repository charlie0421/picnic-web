#!/bin/bash

# UTF-8 인코딩 설정
export LANG=ko_KR.UTF-8
export LC_ALL=ko_KR.UTF-8

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PORT=3100
PROJECT_NAME="Picnic Web"

echo -e "${BLUE}🚀 ${PROJECT_NAME} 개발 서버 시작 스크립트${NC}"
echo "=================================================="

# 포트에서 실행 중인 프로세스 확인
echo -e "${BLUE}🔍 포트 ${PORT}에서 실행 중인 프로세스 확인 중...${NC}"

# 포트에서 실행 중인 프로세스 찾기
PID=$(lsof -ti:$PORT 2>/dev/null)

if [ ! -z "$PID" ]; then
    # 프로세스 정보 가져오기
    PROCESS_INFO=$(ps -p $PID -o comm= 2>/dev/null)
    echo -e "${YELLOW}⚠️  포트 ${PORT}에서 실행 중인 프로세스 발견${NC}"
    echo -e "   PID: $PID"
    echo -e "   프로세스: $PROCESS_INFO"
    echo -e "${YELLOW}🔄 프로세스 종료 중...${NC}"
    
    # 프로세스 종료 시도
    kill $PID 2>/dev/null
    sleep 2
    
    # 프로세스가 여전히 실행 중인지 확인
    if kill -0 $PID 2>/dev/null; then
        echo -e "${RED}⚠️  프로세스가 정상 종료되지 않았습니다. 강제 종료 중...${NC}"
        kill -9 $PID 2>/dev/null
        sleep 1
    fi
    
    echo -e "${GREEN}✅ 프로세스가 종료되었습니다.${NC}"
else
    echo -e "${GREEN}✅ 포트 ${PORT}는 사용 가능합니다.${NC}"
fi

# 포트가 완전히 해제될 때까지 대기
echo -e "${BLUE}⏳ 포트 해제 확인 중...${NC}"
while lsof -ti:$PORT >/dev/null 2>&1; do
    echo -e "${YELLOW}   포트 해제 대기 중...${NC}"
    sleep 1
done

echo -e "${GREEN}✅ 포트 ${PORT}가 완전히 해제되었습니다.${NC}"
echo ""

# 개발 서버 시작
echo -e "${BLUE}🚀 개발 서버 시작 중...${NC}"
echo -e "${BLUE}   URL: http://localhost:${PORT}${NC}"

# 네트워크 IP 가져오기 (macOS)
NETWORK_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "N/A")
echo -e "${BLUE}   Network: http://${NETWORK_IP}:${PORT}${NC}"
echo ""

# Next.js 개발 서버 실행
exec npm run next-dev 