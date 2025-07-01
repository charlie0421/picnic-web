#!/bin/bash

echo "🔍 JWT_SECRET 삭제 감지 디버깅"
echo "================================"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 1. .env.local에서 JWT_SECRET 확인
echo -e "\n${BLUE}1. .env.local 파일에서 JWT_SECRET 검색:${NC}"
if grep -n "JWT_SECRET" .env.local 2>/dev/null; then
    echo -e "${RED}❌ JWT_SECRET이 아직 .env.local에 있습니다!${NC}"
else
    echo -e "${GREEN}✅ JWT_SECRET이 .env.local에서 삭제되었습니다${NC}"
fi

# 2. 캐시에서 JWT_SECRET 확인
echo -e "\n${BLUE}2. 캐시에서 JWT_SECRET 확인:${NC}"
if grep -n "JWT_SECRET" .vercel-env-cache/development.cache 2>/dev/null; then
    echo -e "${GREEN}✅ 캐시에 JWT_SECRET이 있습니다${NC}"
else
    echo -e "${RED}❌ 캐시에 JWT_SECRET이 없습니다${NC}"
fi

# 3. get_local_vars 함수 테스트
echo -e "\n${BLUE}3. get_local_vars 함수 테스트:${NC}"
get_local_vars() {
    local env_file=$1
    local temp_file=$(mktemp)
    
    if [[ ! -f "$env_file" ]]; then
        echo "❌ 파일이 존재하지 않습니다: $env_file"
        return 1
    fi
    
    # 주석과 빈 줄 제외하고 환경변수 추출
    while IFS= read -r line; do
        # 주석이나 빈 줄 건너뛰기
        if [[ $line =~ ^[[:space:]]*# ]] || [[ -z "${line// }" ]]; then
            continue
        fi
        
        # 환경변수 형식 확인 (KEY=VALUE)
        if [[ $line =~ ^[A-Z_][A-Z0-9_]*= ]]; then
            key=$(echo "$line" | cut -d'=' -f1)
            value=$(echo "$line" | cut -d'=' -f2-)
            
            # 빈 값도 포함 (삭제 감지를 위해)
            echo "$key=$value"
        fi
    done < "$env_file" > "$temp_file"
    
    cat "$temp_file"
    rm "$temp_file"
}

local_vars=$(get_local_vars .env.local)
if echo "$local_vars" | grep -q "JWT_SECRET"; then
    echo -e "${RED}❌ get_local_vars가 JWT_SECRET을 여전히 찾습니다:${NC}"
    echo "$local_vars" | grep "JWT_SECRET"
else
    echo -e "${GREEN}✅ get_local_vars에서 JWT_SECRET이 없습니다${NC}"
fi

# 4. 실제 차이점 분석 시뮬레이션
echo -e "\n${BLUE}4. 변경사항 분석 시뮬레이션:${NC}"
local_vars_file=$(mktemp)
vercel_vars_file=$(mktemp)

get_local_vars .env.local > "$local_vars_file"
cp .vercel-env-cache/development.cache "$vercel_vars_file"

echo "로컬 변수 수: $(wc -l < "$local_vars_file")"
echo "Vercel 변수 수: $(wc -l < "$vercel_vars_file")"

# 제거된 변수 찾기
removed_count=0
while IFS= read -r line; do
    if [[ -z "$line" ]]; then continue; fi
    
    key=$(echo "$line" | cut -d'=' -f1)
    
    if ! grep -q "^$key=" "$local_vars_file"; then
        echo -e "${RED}🗑️ 제거된 변수 감지: $key${NC}"
        removed_count=$((removed_count + 1))
    fi
done < "$vercel_vars_file"

echo "제거된 변수 수: $removed_count"

# 정리
rm "$local_vars_file" "$vercel_vars_file"

# 5. 실제 env-sync 실행 테스트
echo -e "\n${BLUE}5. 실제 env-sync --dry-run 실행:${NC}"
echo "다음 명령을 실행해보세요:"
echo "./scripts/env-sync --dry-run --verbose dev"

echo -e "\n${YELLOW}💡 디버깅 팁:${NC}"
echo "1. JWT_SECRET이 아직 .env.local에 있다면 완전히 삭제해주세요"
echo "2. 캐시를 강제로 새로 고침하려면: rm -rf .vercel-env-cache"
echo "3. 다른 환경(.env.preview, .env.production)에서 삭제한 경우 해당 환경을 지정해주세요" 