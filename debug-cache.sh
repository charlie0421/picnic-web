#!/bin/bash

echo "🔍 캐시 파싱 로직 디버깅"
echo "======================="

echo -e "\n1. vercel env ls 원본 출력:"
vercel env ls

echo -e "\n2. 파싱 테스트:"
temp_file=$(mktemp)
vercel env ls 2>/dev/null > "$temp_file"

echo -e "\n3. 임시 파일 내용:"
cat "$temp_file" | head -10

echo -e "\n4. Development 환경 변수 추출 시뮬레이션:"
parsing=false
while IFS= read -r line; do
    # 헤더 라인을 지나 데이터 영역에 들어왔는지 확인
    if [[ $line =~ ^[[:space:]]*name[[:space:]]+ ]]; then
        echo "📋 헤더 라인 감지: $line"
        parsing=true
        continue
    fi
    
    # 데이터 영역에 있고, 빈 줄이 아닌 경우
    if [[ $parsing == true && -n "${line// }" ]]; then
        # 변수명은 첫 번째 단어
        var_name=$(echo "$line" | awk '{print $1}')
        # 환경은 세 번째 단어부터 끝까지
        environments=$(echo "$line" | awk '{for(i=3;i<=NF-1;i++) printf "%s ", $i; print $NF}')
        
        echo "🔍 분석 중: '$line'"
        echo "   변수명: '$var_name'"
        echo "   환경들: '$environments'"
        
        # 변수명이 유효한지 확인 (대문자, 숫자, 언더스코어만)
        if [[ $var_name =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
            # Development 환경이 포함되어 있는지 확인
            if [[ $environments == *"Development"* ]]; then
                echo "   ✅ Development 환경에 포함: $var_name"
            else
                echo "   ❌ Development 환경에 없음: $var_name (환경: $environments)"
            fi
        else
            echo "   ❌ 유효하지 않은 변수명: $var_name"
        fi
        echo ""
    fi
done < "$temp_file"

rm "$temp_file"

echo -e "\n5. 실제 캐시 생성 테스트:"
cache_vercel_state() {
    local environment=$1
    local cache_file="debug_${environment}.cache"
    
    echo "📋 $environment 환경 캐시 생성 중..."
    
    # 환경명 변환
    local env_display
    case $environment in
        "development") env_display="Development" ;;
        "preview") env_display="Preview" ;;
        "production") env_display="Production" ;;
    esac
    
    echo "찾는 환경명: '$env_display'"
    
    # 캐시 파일 초기화
    > "$cache_file"
    
    # 임시 파일 사용
    local temp_file=$(mktemp)
    
    # Vercel env ls 결과를 임시 파일에 저장
    vercel env ls 2>/dev/null > "$temp_file"
    
    # 임시 파일에서 해당 환경의 변수들만 추출
    local parsing=false
    while IFS= read -r line; do
        # 헤더 라인을 지나 데이터 영역에 들어왔는지 확인
        if [[ $line =~ ^[[:space:]]*name[[:space:]]+ ]]; then
            parsing=true
            continue
        fi
        
        # 데이터 영역에 있고, 빈 줄이 아닌 경우
        if [[ $parsing == true && -n "${line// }" ]]; then
            # 변수명은 첫 번째 단어
            local var_name=$(echo "$line" | awk '{print $1}')
            # 환경은 세 번째 단어부터 끝까지
            local environments=$(echo "$line" | awk '{for(i=3;i<=NF-1;i++) printf "%s ", $i; print $NF}')
            
            # 변수명이 유효한지 확인 (대문자, 숫자, 언더스코어만)
            if [[ $var_name =~ ^[A-Z_][A-Z0-9_]*$ ]]; then
                # 해당 환경이 포함되어 있는지 확인
                if [[ $environments == *"$env_display"* ]]; then
                    echo "$var_name=ENCRYPTED_VALUE" >> "$cache_file"
                    echo "✅ 캐시에 추가: $var_name"
                fi
            fi
        fi
    done < "$temp_file"
    
    rm "$temp_file"
    
    echo "캐시 파일 내용 ($(wc -l < "$cache_file") 개 변수):"
    cat "$cache_file"
}

cache_vercel_state "development" 