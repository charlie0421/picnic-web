#!/bin/bash

# Vercel 환경변수 스마트 동기화 스크립트

echo -e "🔧 [MAIN DEBUG] 스크립트 시작 - $0 $@"
echo -e "🔧 [MAIN DEBUG] 현재 디렉토리: $(pwd)"

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "🔧 [MAIN DEBUG] 색상 정의 완료"

# 설정
CACHE_DIR=".vercel-env-cache"
mkdir -p "$CACHE_DIR"

# 함수: 도움말 표시
show_help() {
    echo "사용법:"
    echo "  $0 [옵션] [환경]"
    echo ""
    echo "환경:"
    echo "  dev, development     Development 환경 (.env.local)"
    echo "  preview              Preview 환경 (.env.preview)"
    echo "  prod, production     Production 환경 (.env.production)"
    echo "  all                  모든 환경"
    echo ""
    echo "옵션:"
    echo "  -f, --force         강제 업데이트 (기존 값 덮어쓰기)"
    echo "  -d, --dry-run       실제 변경 없이 미리보기만"
    echo "  -v, --verbose       상세 출력"
    echo "  -w, --watch         파일 변경 감지 모드"
    echo "  --refresh-cache     캐시 강제 재생성"
    echo "  -h, --help          도움말 표시"
    echo ""
    echo "예시:"
    echo "  $0 dev              # Development 환경만 동기화"
    echo "  $0 all              # 모든 환경 동기화"
    echo "  $0 --dry-run prod   # Production 환경 미리보기"
    echo "  $0 --watch          # 파일 변경 감지 모드"
}

# 함수: Vercel 현재 상태를 캐시 파일로 저장
cache_vercel_state() {
    local environment=$1
    local cache_file="$CACHE_DIR/${environment}.cache"
    
    echo -e "${BLUE}📋 $environment 환경 현재 상태 캐싱...${NC}" >&2
    
    # 환경명 변환
    local env_display
    case $environment in
        "development") env_display="Development" ;;
        "preview") env_display="Preview" ;;
        "production") env_display="Production" ;;
    esac
    
    # 캐시 파일 초기화
    > "$cache_file"
    
    echo -e "${PURPLE}   🔍 $env_display 환경의 변수들을 검색 중...${NC}" >&2
    
    # 새로운 강력한 파싱 방법
    local temp_output=$(mktemp)
    vercel env ls 2>/dev/null > "$temp_output"
    
    local count=0
    
    # 디버깅: 원본 출력 확인
    if [[ $VERBOSE == "true" ]]; then
        echo -e "${PURPLE}   🔧 vercel env ls 원본 출력 (처음 10줄):${NC}" >&2
        head -10 "$temp_output" | while read -r line; do
            echo -e "${PURPLE}       '$line'${NC}" >&2
        done
    fi
    
    # 각 줄을 처리
    while IFS= read -r line; do
        # 빈 줄 건너뛰기
        [[ -z "${line// }" ]] && continue
        
        # 헤더나 정보 줄 건너뛰기
        [[ $line =~ ^Vercel ]] && continue
        [[ $line =~ ^[[:space:]]*\> ]] && continue
        [[ $line =~ ^[[:space:]]*name ]] && continue
        [[ $line =~ ^[[:space:]]*$ ]] && continue
        
        # 환경변수 라인인지 확인 (공백으로 시작하고 대문자로 시작하는 변수명)
        if [[ $line =~ ^[[:space:]]+([A-Z_][A-Z0-9_]*)[[:space:]] ]]; then
            # 변수명 추출 (정규표현식 매치 결과 사용)
            local var_name="${BASH_REMATCH[1]}"
            
            [[ $VERBOSE == "true" ]] && echo -e "${PURPLE}   🔧 파싱 중: '$line' → 변수명: '$var_name'${NC}" >&2
            
            # 해당 환경이 라인에 포함되어 있는지 확인
            if [[ $line == *"$env_display"* ]]; then
                echo "$var_name=ENCRYPTED_VALUE" >> "$cache_file"
                count=$((count + 1))
                [[ $VERBOSE == "true" ]] && echo -e "${GREEN}   ✅ 캐시에 추가: $var_name${NC}" >&2
            else
                [[ $VERBOSE == "true" ]] && echo -e "${YELLOW}   ⏭️ 다른 환경: $var_name (환경: $(echo "$line" | awk '{for(i=3;i<=NF-2;i++) printf "%s ", $i; print $(NF-1)}'))${NC}" >&2
            fi
        fi
    done < "$temp_output"
    
    rm "$temp_output"
    
    echo -e "${PURPLE}   💾 캐시 저장 완료: $cache_file ($count 개 변수)${NC}" >&2
    
    # JWT_SECRET 특별 확인
    if [[ $VERBOSE == "true" ]]; then
        if grep -q "JWT_SECRET" "$cache_file" 2>/dev/null; then
            echo -e "${GREEN}   ✅ JWT_SECRET이 캐시에 포함되었습니다${NC}" >&2
        else
            echo -e "${RED}   ❌ JWT_SECRET이 캐시에 포함되지 않았습니다${NC}" >&2
        fi
        
        echo -e "${PURPLE}   🔧 생성된 캐시 내용:${NC}" >&2
        cat "$cache_file" | while read -r line; do
            echo -e "${PURPLE}       $line${NC}" >&2
        done
    fi
}

# 함수: 캐시를 로컬 값으로 업데이트
update_cache_with_local_values() {
    local env_file=$1
    local environment=$2
    local cache_file="$CACHE_DIR/${environment}.cache"
    
    echo -e "${PURPLE}   📝 로컬 값으로 캐시 업데이트 중...${NC}" >&2
    
    # 캐시 파일 초기화
    > "$cache_file"
    
    # 로컬 변수들을 캐시에 저장 (실제 값으로)
    get_local_vars "$env_file" > "$cache_file"
    
    local count=$(wc -l < "$cache_file")
    echo -e "${PURPLE}   💾 로컬 값 캐시 저장 완료: $cache_file ($count 개 변수)${NC}" >&2
    
    if [[ $VERBOSE == "true" ]]; then
        echo -e "${PURPLE}   🔧 로컬 값 캐시 내용:${NC}" >&2
        cat "$cache_file" | while read -r line; do
            key=$(echo "$line" | cut -d'=' -f1)
            echo -e "${PURPLE}       $key=***${NC}" >&2
        done
    fi
}

# 함수: 로컬 env 파일에서 변수 추출
get_local_vars() {
    local env_file=$1
    local temp_file=$(mktemp)
    
    if [[ ! -f "$env_file" ]]; then
        echo -e "${RED}❌ 파일이 존재하지 않습니다: $env_file${NC}"
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
            
            # 빈 값은 무시 (삭제나 추가 시도하지 않음)
            if [[ -n "$value" ]]; then
                echo "$key=$value"
            fi
        fi
    done < "$env_file" > "$temp_file"
    
    cat "$temp_file"
    rm "$temp_file"
}

# 함수: 차이점 분석
analyze_changes() {
    local env_file=$1
    local environment=$2
    local cache_file="$CACHE_DIR/${environment}.cache"
    
    echo -e "\n${RED}🔧 [ANALYZE DEBUG] analyze_changes 함수 시작${NC}" >&2
    echo -e "${RED}🔧 [ANALYZE DEBUG] env_file=$env_file, environment=$environment${NC}" >&2
    echo -e "${RED}🔧 [ANALYZE DEBUG] cache_file=$cache_file${NC}" >&2
    echo -e "${RED}🔧 [ANALYZE DEBUG] VERBOSE=$VERBOSE${NC}" >&2
    
    echo -e "\n${YELLOW}🔍 $environment 환경 변경사항 분석...${NC}" >&2
    [[ $VERBOSE == "true" ]] && echo -e "${PURPLE}   🔧 디버깅: 캐시 파일 경로 = $cache_file${NC}" >&2
    
    # 임시 파일들
    local local_vars_file=$(mktemp)
    local vercel_vars_file=$(mktemp)
    local changes_file=$(mktemp)
    
    # 로컬 변수들 가져오기
    get_local_vars "$env_file" > "$local_vars_file"
    [[ $VERBOSE == "true" ]] && echo -e "${PURPLE}   🔧 디버깅: 로컬 변수 $(wc -l < "$local_vars_file") 개 로드됨${NC}" >&2
    
    # 캐시 상태 확인 및 생성
    if [[ ! -f "$cache_file" ]]; then
        [[ $VERBOSE == "true" ]] && echo -e "${PURPLE}   🔧 디버깅: 캐시 파일이 없음 → Vercel 상태 캐싱${NC}" >&2
        cache_vercel_state "$environment"
    else
        [[ $VERBOSE == "true" ]] && echo -e "${PURPLE}   🔧 디버깅: 기존 캐시 파일 사용 ($(wc -l < "$cache_file" 2>/dev/null) 개 변수)${NC}" >&2
    fi
    
    # 캐시 파일이 정상적으로 생성/존재하는지 재확인
    if [[ ! -f "$cache_file" ]]; then
        echo -e "${RED}❌ 캐시 파일 생성 실패: $cache_file${NC}" >&2
        rm "$local_vars_file" "$vercel_vars_file" "$changes_file"
        return 1
    fi
    
    cp "$cache_file" "$vercel_vars_file"
    [[ $VERBOSE == "true" ]] && echo -e "${PURPLE}   🔧 디버깅: Vercel 캐시 $(wc -l < "$vercel_vars_file") 개 변수 로드됨${NC}" >&2
    
    # JWT_SECRET 특별 추적
    if [[ $VERBOSE == "true" ]]; then
        if grep -q "JWT_SECRET" "$local_vars_file" 2>/dev/null; then
            echo -e "${PURPLE}   🔧 디버깅: JWT_SECRET이 로컬에 있음${NC}" >&2
        else
            echo -e "${PURPLE}   🔧 디버깅: JWT_SECRET이 로컬에 없음${NC}" >&2
        fi
        
        if grep -q "JWT_SECRET" "$vercel_vars_file" 2>/dev/null; then
            echo -e "${PURPLE}   🔧 디버깅: JWT_SECRET이 Vercel 캐시에 있음${NC}" >&2
        else
            echo -e "${PURPLE}   🔧 디버깅: JWT_SECRET이 Vercel 캐시에 없음${NC}" >&2
        fi
    fi
    
    # 변경 통계
    local new_count=0
    local changed_count=0
    local removed_count=0
    
    # 새로운/변경된 변수들 찾기
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then continue; fi
        
        key=$(echo "$line" | cut -d'=' -f1)
        value=$(echo "$line" | cut -d'=' -f2-)
        
        if grep -q "^$key=" "$vercel_vars_file"; then
            # 기존 변수 - FORCE 모드이거나 값이 ENCRYPTED_VALUE가 아닌 경우만 변경 감지
            cached_value=$(grep "^$key=" "$vercel_vars_file" | cut -d'=' -f2-)
            
            if [[ "$FORCE" == "true" ]]; then
                echo "CHANGED:$key=$value" >> "$changes_file"
                changed_count=$((changed_count + 1))
                [[ $VERBOSE == "true" ]] && echo -e "${BLUE}   🔄 변경: $key (--force 모드)${NC}" >&2
            elif [[ "$cached_value" != "ENCRYPTED_VALUE" && "$value" != "$cached_value" ]]; then
                echo "CHANGED:$key=$value" >> "$changes_file"
                changed_count=$((changed_count + 1))
                [[ $VERBOSE == "true" ]] && echo -e "${BLUE}   🔄 변경: $key (값이 다름)${NC}" >&2
            else
                [[ $VERBOSE == "true" ]] && echo -e "${GREEN}   ✅ 건너뛰기: $key (기존 변수, --force 없음)${NC}" >&2
            fi
        else
            # 새로운 변수
            echo "NEW:$key=$value" >> "$changes_file"
            new_count=$((new_count + 1))
            [[ $VERBOSE == "true" ]] && echo -e "${GREEN}   ➕ 신규: $key${NC}" >&2
        fi
    done < "$local_vars_file"
    
    # 제거된 변수들 찾기 (로컬에는 없지만 Vercel에는 있는 것)
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then continue; fi
        
        key=$(echo "$line" | cut -d'=' -f1)
        
        if ! grep -q "^$key=" "$local_vars_file"; then
            echo "REMOVED:$key" >> "$changes_file"
            removed_count=$((removed_count + 1))
            [[ $VERBOSE == "true" ]] && echo -e "${RED}   🗑️ 제거: $key${NC}" >&2
        fi
    done < "$vercel_vars_file"
    
    # 결과 출력
    echo -e "${PURPLE}📊 변경사항 요약:${NC}" >&2
    echo -e "${GREEN}   ➕ 신규: ${new_count}건${NC}" >&2
    echo -e "${BLUE}   🔄 변경: ${changed_count}건${NC}" >&2
    echo -e "${RED}   🗑️ 제거: ${removed_count}건${NC}" >&2
    
    # 정리
    rm "$local_vars_file" "$vercel_vars_file"
    
    # 변경사항이 있으면 changes_file 경로 반환
    if [[ $((new_count + changed_count + removed_count)) -gt 0 ]]; then
        [[ $VERBOSE == "true" ]] && echo -e "${RED}🔧 [ANALYZE DEBUG] 변경사항 ${new_count}+${changed_count}+${removed_count} = $((new_count + changed_count + removed_count))건 감지, changes_file 반환: $changes_file${NC}" >&2
        echo "$changes_file"
    else
        [[ $VERBOSE == "true" ]] && echo -e "${RED}🔧 [ANALYZE DEBUG] 변경사항 없음, 빈 문자열 반환${NC}" >&2
        rm "$changes_file"
        echo ""
    fi
}

# 함수: 변경사항 적용
apply_changes() {
    local changes_file=$1
    local environment=$2
    local env_file=$3
    
    if [[ -z "$changes_file" || ! -f "$changes_file" ]]; then
        echo -e "${GREEN}✅ 변경사항이 없습니다.${NC}"
        return 0
    fi
    
    echo -e "\n${YELLOW}🚀 $environment 환경에 변경사항 적용 중...${NC}"
    
    local success_count=0
    local failed_count=0
    
    while IFS= read -r line; do
        if [[ -z "$line" ]]; then continue; fi
        
        local action=$(echo "$line" | cut -d':' -f1)
        local var_info=$(echo "$line" | cut -d':' -f2-)
        
        case "$action" in
            "NEW"|"CHANGED")
                local key=$(echo "$var_info" | cut -d'=' -f1)
                local value=$(echo "$var_info" | cut -d'=' -f2-)
                
                # 빈 값인 경우 삭제로 처리
                if [[ -z "$value" ]]; then
                    echo -e "${YELLOW}   🔄 빈 값 감지: $key → 삭제 처리${NC}"
                    
                    if [[ "$DRY_RUN" == "true" ]]; then
                        echo -e "${YELLOW}   📝 [DRY RUN] $key 삭제 예정 (빈 값)${NC}"
                        success_count=$((success_count + 1))
                    else
                        # 빈 값 삭제 전 존재 여부 확인
                        if vercel env ls 2>/dev/null | grep -q "^[[:space:]]*$key[[:space:]]"; then
                                local delete_output=$(vercel env remove "$key" --yes 2>&1)
                            local delete_exit_code=$?
                            
                            if [[ $delete_exit_code -eq 0 ]]; then
                                echo -e "${GREEN}   ✅ $key 삭제 성공 (빈 값)${NC}"
                                success_count=$((success_count + 1))
                            else
                                echo -e "${RED}   ❌ $key 삭제 실패 (빈 값)${NC}"
                                echo -e "${RED}      에러: $delete_output${NC}"
                                failed_count=$((failed_count + 1))
                            fi
                        else
                            echo -e "${BLUE}   ✅ $key 이미 삭제됨 (빈 값이지만 존재하지 않음)${NC}"
                            success_count=$((success_count + 1))
                        fi
                    fi
                else
                    echo -e "${BLUE}   🔄 처리 중: $key${NC}"
                    
                    if [[ "$DRY_RUN" == "true" ]]; then
                        echo -e "${YELLOW}   📝 [DRY RUN] $key 업데이트 예정${NC}"
                        success_count=$((success_count + 1))
                    else
                        # 임시 파일에 값 저장
                        local temp_file=$(mktemp)
                        echo -n "$value" > "$temp_file"
                        
                        # Vercel에 환경변수 추가/업데이트
                        local cmd_args="$key $environment"
                        if [[ "$FORCE" == "true" || "$action" == "CHANGED" ]]; then
                            cmd_args="$cmd_args --force"
                        fi
                        
                        # 에러 메시지를 capture해서 실패 원인 파악
                        local error_output=$(cat "$temp_file" | vercel env add $cmd_args 2>&1)
                        local exit_code=$?
                        
                        if [[ $exit_code -eq 0 ]]; then
                            echo -e "${GREEN}   ✅ $key 성공${NC}"
                            success_count=$((success_count + 1))
                        else
                            echo -e "${RED}   ❌ $key 실패${NC}"
                            echo -e "${RED}      에러: $error_output${NC}"
                            failed_count=$((failed_count + 1))
                        fi
                        
                        rm "$temp_file"
                    fi
                fi
                ;;
                
            "REMOVED")
                local key="$var_info"
                echo -e "${RED}   🗑️ 삭제 중: $key${NC}"
                
                if [[ "$DRY_RUN" == "true" ]]; then
                    echo -e "${YELLOW}   📝 [DRY RUN] $key 삭제 예정${NC}"
                    success_count=$((success_count + 1))
                else
                    # 삭제 전 존재 여부 확인
                    if vercel env ls 2>/dev/null | grep -q "^[[:space:]]*$key[[:space:]]"; then
                        local remove_output=$(vercel env remove "$key" --yes 2>&1)
                        local remove_exit_code=$?
                        
                        if [[ $remove_exit_code -eq 0 ]]; then
                            echo -e "${GREEN}   ✅ $key 삭제 성공${NC}"
                            success_count=$((success_count + 1))
                        else
                            echo -e "${RED}   ❌ $key 삭제 실패${NC}"
                            echo -e "${RED}      에러: $remove_output${NC}"
                            failed_count=$((failed_count + 1))
                        fi
                    else
                        echo -e "${BLUE}   ✅ $key 이미 삭제됨 (존재하지 않음)${NC}"
                        success_count=$((success_count + 1))
                    fi
                fi
                ;;
        esac
        
        [[ "$DRY_RUN" != "true" ]] && sleep 0.3  # API 제한 방지
    done < "$changes_file"
    
    # 결과 출력
    echo -e "\n${PURPLE}📊 적용 결과:${NC}"
    echo -e "${GREEN}   ✅ 성공: ${success_count}건${NC}"
    if [[ $failed_count -gt 0 ]]; then
        echo -e "${RED}   ❌ 실패: ${failed_count}건${NC}"
    fi
    
    # 캐시 업데이트 로직 개선 (Vercel 실제 상태로)
    if [[ "$DRY_RUN" != "true" ]]; then
        if [[ $success_count -gt 0 ]]; then
            echo -e "${YELLOW}🔄 캐시 업데이트 중...${NC}"
            # 적용 후 Vercel의 실제 상태를 캐시에 저장
            cache_vercel_state "$environment"
            echo -e "${GREEN}✅ 캐시 업데이트 완료${NC}"
        else
            echo -e "${YELLOW}⚠️ 성공한 변경사항이 없어 캐시를 업데이트하지 않습니다${NC}"
        fi
        
        # 실패가 있었다면 다음 실행 시 다시 시도할 수 있도록 알림
        if [[ $failed_count -gt 0 ]]; then
            echo -e "${YELLOW}⚠️ 일부 실패한 항목이 있습니다. 다음 실행 시 다시 시도됩니다.${NC}"
        fi
    fi
    
    rm "$changes_file"
}

# 함수: 단일 환경 동기화
sync_environment() {
    local env_arg=$1
    local env_file=""
    local environment=""
    
    echo -e "${RED}🔧 [DEBUG] sync_environment 함수 시작: $env_arg${NC}"
    
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
    
    echo -e "\n${BLUE}📁 $environment 환경 동기화 ($env_file)${NC}"
    echo -e "${RED}🔧 [DEBUG] 파일 체크: $env_file${NC}"
    
    if [[ ! -f "$env_file" ]]; then
        echo -e "${RED}❌ 파일이 존재하지 않습니다: $env_file${NC}"
        return 1
    fi
    
    # 캐시 강제 재생성 옵션 처리
    if [[ "$REFRESH_CACHE" == "true" ]]; then
        echo -e "${YELLOW}🔄 캐시 강제 재생성 중...${NC}"
        rm -f "$CACHE_DIR/${environment}.cache"
        cache_vercel_state "$environment"
        echo -e "${GREEN}✅ 캐시 재생성 완료${NC}"
    fi
    
    echo -e "${RED}🔧 [DEBUG] analyze_changes 호출 전 - VERBOSE=$VERBOSE${NC}"
    
    # 변경사항 분석
    local changes_file=$(analyze_changes "$env_file" "$environment")
    
    echo -e "${RED}🔧 [DEBUG] analyze_changes 호출 후 - changes_file=$changes_file${NC}"
    
    # 변경사항 적용
    apply_changes "$changes_file" "$environment" "$env_file"
}

# 함수: 파일 변경 감지 모드
watch_mode() {
    echo -e "${PURPLE}👀 파일 변경 감지 모드 시작...${NC}"
    echo -e "${YELLOW}   .env.local, .env.preview, .env.production 파일을 감시합니다${NC}"
    echo -e "${YELLOW}   Ctrl+C로 종료${NC}"
    
    # fswatch가 있는지 확인
    if ! command -v fswatch >/dev/null 2>&1; then
        echo -e "${RED}❌ fswatch가 설치되어 있지 않습니다.${NC}"
        echo -e "${YELLOW}   설치: brew install fswatch${NC}"
        return 1
    fi
    
    # 파일 감시 시작
    fswatch -o .env.local .env.preview .env.production 2>/dev/null | while read -r num; do
        echo -e "\n${GREEN}🔔 환경 파일 변경 감지!${NC}"
        
        # 변경된 파일별로 동기화
        for file in .env.local .env.preview .env.production; do
            if [[ -f "$file" ]]; then
                case "$file" in
                    ".env.local") sync_environment "development" ;;
                    ".env.preview") sync_environment "preview" ;;
                    ".env.production") sync_environment "production" ;;
                esac
            fi
        done
        
        echo -e "${PURPLE}⏰ 변경 감지 계속 중... (Ctrl+C로 종료)${NC}"
    done
}

# 기본값 설정
FORCE="false"
DRY_RUN="false"
VERBOSE="false"
WATCH="false"
REFRESH_CACHE="false"

# 명령행 인수 파싱
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE="true"
            shift
            ;;
        -d|--dry-run)
            DRY_RUN="true"
            shift
            ;;
        -v|--verbose)
            VERBOSE="true"
            shift
            ;;
        -w|--watch)
            WATCH="true"
            shift
            ;;
        --refresh-cache)
            REFRESH_CACHE="true"
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

# DRY RUN 모드 표시
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}📝 DRY RUN 모드: 실제 변경 없이 미리보기만 표시${NC}"
fi

# Watch 모드
if [[ "$WATCH" == "true" ]]; then
    watch_mode
    exit 0
fi

# 환경 지정이 없으면 대화형 선택
if [[ -z "$ENV_TARGET" ]]; then
    echo -e "${BLUE}환경을 선택하세요:${NC}"
    echo "1) Development (.env.local)"
    echo "2) Preview (.env.preview)"
    echo "3) Production (.env.production)"
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

# 동기화 실행
case "$ENV_TARGET" in
    "all")
        echo -e "${PURPLE}🎯 모든 환경 동기화 시작...${NC}"
        sync_environment "development"
        sync_environment "preview"
        sync_environment "production"
        ;;
    *)
        sync_environment "$ENV_TARGET"
        ;;
esac

echo -e "\n${GREEN}✅ 동기화 완료!${NC}"
if [[ "$DRY_RUN" != "true" ]]; then
    echo -e "${BLUE}🌐 Vercel 대시보드: https://vercel.com/dashboard${NC}"
fi
