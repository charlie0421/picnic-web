#!/bin/bash

echo "=== 로컬 vs Vercel 정확한 차이 분석 ==="

echo "1. 로컬에만 있는 변수들 (값이 있는 것만):"
while IFS= read -r line; do
    if [[ $line =~ ^[A-Z_][A-Z0-9_]*= ]]; then
        key=$(echo "$line" | cut -d'=' -f1)
        value=$(echo "$line" | cut -d'=' -f2-)
        
        # 빈 값이 아닌 것만
        if [[ -n "$value" ]]; then
            echo "$key"
        fi
    fi
done < .env.local | sort > /tmp/local_vars.txt

cut -d'=' -f1 .vercel-env-cache/development.cache | sort > /tmp/vercel_vars.txt

echo "로컬에만 있는 변수들:"
comm -23 /tmp/local_vars.txt /tmp/vercel_vars.txt | while read var; do
    value=$(grep "^$var=" .env.local | cut -d'=' -f2-)
    if [[ -n "$value" ]]; then
        echo "  - $var (값: ${value:0:20}...)"
    else
        echo "  - $var (빈 값)"
    fi
done

echo -e "\n2. Vercel에만 있는 변수들:"
comm -13 /tmp/local_vars.txt /tmp/vercel_vars.txt | while read var; do
    echo "  - $var"
done

echo -e "\n3. 요약:"
local_count=$(wc -l < /tmp/local_vars.txt)
vercel_count=$(wc -l < /tmp/vercel_vars.txt)
local_only=$(comm -23 /tmp/local_vars.txt /tmp/vercel_vars.txt | wc -l)
vercel_only=$(comm -13 /tmp/local_vars.txt /tmp/vercel_vars.txt | wc -l)

echo "  로컬 (값 있는 것만): $local_count 개"
echo "  Vercel: $vercel_count 개"
echo "  로컬에만: $local_only 개"
echo "  Vercel에만: $vercel_only 개"

# 정리
rm -f /tmp/local_vars.txt /tmp/vercel_vars.txt

echo -e "\n=== 분석 완료 ===" 