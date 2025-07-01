#!/bin/bash

echo "=== Vercel 실제 상태 VS 로컬 상태 비교 ==="

echo "1. 로컬 .env.local 환경변수 개수:"
if [ -f ".env.local" ]; then
    local_count=$(grep -E "^[A-Z_]" .env.local | wc -l)
    echo "   📁 로컬: $local_count 개"
    echo "   처음 5개:"
    grep -E "^[A-Z_]" .env.local | head -5 | while read line; do
        echo "     - $(echo $line | cut -d'=' -f1)"
    done
else
    echo "   ❌ .env.local 없음"
fi

echo -e "\n2. Vercel Development 환경 실제 환경변수 개수:"
vercel_count=$(vercel env ls 2>/dev/null | grep -E "^\s+[A-Z_].*Development" | wc -l)
echo "   ☁️ Vercel: $vercel_count 개"

echo -e "\n3. 캐시 파일 환경변수 개수:"
if [ -f ".vercel-env-cache/development.cache" ]; then
    cache_count=$(wc -l < .vercel-env-cache/development.cache)
    echo "   💾 캐시: $cache_count 개"
else
    echo "   ❌ 캐시 없음"
fi

echo -e "\n4. 실제 JWT_SECRET 상태:"
echo "   로컬 .env.local:"
if [ -f ".env.local" ] && grep -q "JWT_SECRET" .env.local; then
    echo "     ✅ JWT_SECRET 있음"
else
    echo "     ❌ JWT_SECRET 없음"
fi

echo "   Vercel Development:"
if vercel env ls 2>/dev/null | grep -q "JWT_SECRET.*Development"; then
    echo "     ✅ JWT_SECRET 있음"
else
    echo "     ❌ JWT_SECRET 없음"
fi

echo "   캐시:"
if [ -f ".vercel-env-cache/development.cache" ] && grep -q "JWT_SECRET" .vercel-env-cache/development.cache; then
    echo "     ✅ JWT_SECRET 있음"
else
    echo "     ❌ JWT_SECRET 없음"
fi

echo -e "\n5. 최근 env-sync 실행 시 실제 적용된 것 확인:"
echo "   마지막 적용 후 1분 내 Vercel 변경사항:"
# 타임스탬프를 이용해 최근 변경사항 감지하는 것은 어려우니 다른 방법으로

echo -e "\n=== 결론 ==="
echo "만약 로컬($local_count) ≠ Vercel($vercel_count) ≠ 캐시($cache_count) 라면"
echo "동기화가 제대로 안되고 있는 것입니다." 