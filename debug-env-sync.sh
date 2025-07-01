#!/bin/bash

echo "=== ENV SYNC 디버깅 ==="

echo "1. .env.local 파일 확인:"
if [ -f ".env.local" ]; then
    echo "✅ .env.local 존재"
    echo "파일 크기: $(wc -l < .env.local) 라인"
    echo "파일 내용 (처음 10라인):"
    head -10 .env.local
else
    echo "❌ .env.local 없음"
fi

echo -e "\n2. 캐시 파일 확인:"
if [ -f ".vercel-env-cache/development.cache" ]; then
    echo "✅ development.cache 존재"
    echo "캐시 크기: $(wc -l < .vercel-env-cache/development.cache) 라인"
    echo "JWT_SECRET 캐시 상태:"
    if grep -q "JWT_SECRET" .vercel-env-cache/development.cache; then
        echo "  ✅ JWT_SECRET이 캐시에 있음"
    else
        echo "  ❌ JWT_SECRET이 캐시에 없음"
    fi
else
    echo "❌ development.cache 없음"
fi

echo -e "\n3. Vercel 실제 상태 확인:"
echo "JWT_SECRET Vercel 상태:"
vercel env ls 2>/dev/null | grep -i jwt || echo "  ❌ JWT_SECRET 없음"

echo -e "\n4. env-sync 스크립트 실행 (dry-run):"
./scripts/env-sync --dry-run --verbose dev

echo -e "\n=== 디버깅 완료 ===" 