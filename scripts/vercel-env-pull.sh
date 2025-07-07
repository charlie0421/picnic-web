#!/bin/bash

# Vercel 환경변수 다운로드 스크립트
# Vercel에서 로컬로 환경변수를 가져옵니다

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# 도움말 표시
show_help() {
    echo "사용법: $0 [환경] [옵션]"
    echo ""
    echo "환경:"
    echo "  dev, development     Development 환경 → .env.local"
    echo "  preview              Preview 환경 → .env.preview"
    echo "  prod, production     Production 환경 → .env.production"
    echo "  all                  모든 환경"
    echo ""
    echo "옵션:"
    echo "  -f, --force         기존 파일 덮어쓰기"
    echo "  -v, --verbose       상세 출력"
    echo "  -h, --help          도움말 표시"
    echo ""
    echo "예시:"
    echo "  $0 dev              # Development 환경을 .env.local로 다운로드"
    echo "  $0 prod --force     # Production 환경을 강제로 .env.production에 덮어쓰기"
}

# Vercel에서 환경변수 가져오기
pull_environment() {
    local env_arg=$1
    local env_file=""
    local environment=""
    
    # 환경 매핑
    case "$env_arg" in
        "dev"|"development")
            env_file=".env.local"
            environment="development"
            ;;
        "preview")
            env_file=".env.preview"
            environment="preview"
            ;;
        "prod"|"production")
            env_file=".env.production"
            environment="production"
            ;;
        *)
            echo -e "${RED}❌ 알 수 없는 환경: $env_arg${NC}"
            return 1
            ;;
    esac
    
    echo -e "${BLUE}📥 $environment 환경 변수를 $env_file로 다운로드 중...${NC}"
    
    # 기존 파일 확인
    if [[ -f "$env_file" && "$FORCE" != "true" ]]; then
        echo -e "${YELLOW}⚠️ 파일이 이미 존재합니다: $env_file${NC}"
        echo -e "${YELLOW}   --force 옵션을 사용하여 덮어쓰거나 다른 이름으로 저장하세요${NC}"
        return 1
    fi
    
    # 환경명 변환 (Vercel에서 사용하는 형식)
    local env_display
    case $environment in
        "development") env_display="Development" ;;
        "preview") env_display="Preview" ;;
        "production") env_display="Production" ;;
    esac
    
    # Vercel에서 환경변수 목록 가져오기
    local temp_output=$(mktemp)
    vercel env ls 2>/dev/null > "$temp_output"
    
    if [[ $? -ne 0 ]]; then
        echo -e "${RED}❌ Vercel 환경변수 목록을 가져올 수 없습니다${NC}"
        rm "$temp_output"
        return 1
    fi
    
    # 임시 env 파일 생성
    local temp_env=$(mktemp)
    echo "# Vercel $env_display 환경변수" > "$temp_env"
    echo "# 다운로드 시간: $(date)" >> "$temp_env"
    echo "" >> "$temp_env"
    
    local count=0
    
    # 환경변수 파싱 및 값 가져오기
    while IFS= read -r line; do
        # 빈 줄이나 헤더 건너뛰기
        [[ -z "${line// }" ]] && continue
        [[ $line =~ ^Vercel ]] && continue
        [[ $line =~ ^[[:space:]]*\> ]] && continue
        [[ $line =~ ^[[:space:]]*name ]] && continue
        
        # 환경변수 라인 확인
        if [[ $line =~ ^[[:space:]]+([A-Z_][A-Z0-9_]*)[[:space:]] ]]; then
            local var_name="${BASH_REMATCH[1]}"
            
            # 해당 환경이 포함되어 있는지 확인
            if [[ $line == *"$env_display"* ]]; then
                [[ $VERBOSE == "true" ]] && echo -e "${PURPLE}   📥 가져오는 중: $var_name${NC}"
                
                # Vercel에서 실제 값 가져오기 (각 변수별로)
                local var_value=$(vercel env pull --environment=$environment --scope=all 2>/dev/null | grep "^$var_name=" | cut -d'=' -f2- || echo "")
                
                if [[ -n "$var_value" ]]; then
                    echo "$var_name=$var_value" >> "$temp_env"
                    count=$((count + 1))
                else
                    # 값을 가져올 수 없는 경우 플레이스홀더 추가
                    echo "# $var_name=<ENCRYPTED_VALUE_FROM_VERCEL>" >> "$temp_env"
                    [[ $VERBOSE == "true" ]] && echo -e "${YELLOW}   ⚠️ $var_name 값을 가져올 수 없음 (암호화됨)${NC}"
                fi
            fi
        fi
    done < "$temp_output"
    
    # 파일 저장
    if [[ $count -gt 0 ]]; then
        mv "$temp_env" "$env_file"
        echo -e "${GREEN}✅ $count개 환경변수를 $env_file에 저장했습니다${NC}"
        
        if [[ $VERBOSE == "true" ]]; then
            echo -e "${PURPLE}📝 저장된 내용:${NC}"
            cat "$env_file"
        fi
    else
        echo -e "${YELLOW}⚠️ 가져올 수 있는 환경변수가 없습니다${NC}"
        rm "$temp_env"
    fi
    
    rm "$temp_output"
}

# 기본값 설정
FORCE="false"
VERBOSE="false"

# 명령행 인수 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE="true"
            shift
            ;;
        -v|--verbose)
            VERBOSE="true"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        -*)
            echo -e "${RED}❌ 알 수 없는 옵션: $1${NC}"
            show_help
            exit 1
            ;;
        *)
            ENV_TARGET="$1"
            shift
            ;;
    esac
done

# Vercel 로그인 확인
if ! vercel whoami >/dev/null 2>&1; then
    echo -e "${RED}❌ Vercel에 로그인되어 있지 않습니다.${NC}"
    echo -e "${YELLOW}   로그인: vercel login${NC}"
    exit 1
fi

# 환경 지정이 없으면 대화형 선택
if [[ -z "$ENV_TARGET" ]]; then
    echo -e "${BLUE}다운로드할 환경을 선택하세요:${NC}"
    echo "1) Development → .env.local"
    echo "2) Preview → .env.preview"
    echo "3) Production → .env.production"
    echo "4) 모든 환경"
    
    read -p "🤔 선택 (1-4): " choice
    
    case $choice in
        1) ENV_TARGET="development" ;;
        2) ENV_TARGET="preview" ;;
        3) ENV_TARGET="production" ;;
        4) ENV_TARGET="all" ;;
        *) echo -e "${RED}❌ 잘못된 선택입니다.${NC}"; exit 1 ;;
    esac
fi

# 다운로드 실행
case "$ENV_TARGET" in
    "all")
        echo -e "${PURPLE}🎯 모든 환경 다운로드 시작...${NC}"
        pull_environment "development"
        pull_environment "preview" 
        pull_environment "production"
        ;;
    *)
        pull_environment "$ENV_TARGET"
        ;;
esac

echo -e "\n${GREEN}✅ 다운로드 완료!${NC}" 