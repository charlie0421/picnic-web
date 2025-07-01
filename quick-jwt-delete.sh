#!/bin/bash

echo "🗑️ JWT_SECRET 삭제 스크립트"
echo "========================="

# 현재 상태 확인
echo -e "\n1. 현재 Vercel 상태:"
vercel env ls | grep JWT_SECRET || echo "JWT_SECRET을 찾을 수 없습니다"

echo -e "\n2. .env.local 상태:"
grep JWT_SECRET .env.local 2>/dev/null || echo "JWT_SECRET이 .env.local에 없습니다"

echo -e "\n3. JWT_SECRET 삭제 실행:"

# Development 환경에서 삭제
echo "Development 환경에서 삭제 중..."
if vercel env remove JWT_SECRET development --yes 2>/dev/null; then
    echo "✅ Development에서 삭제 성공"
else
    echo "❌ Development에서 삭제 실패 (또는 이미 없음)"
fi

# Preview 환경에서 삭제
echo "Preview 환경에서 삭제 중..."
if vercel env remove JWT_SECRET preview --yes 2>/dev/null; then
    echo "✅ Preview에서 삭제 성공"
else
    echo "❌ Preview에서 삭제 실패 (또는 이미 없음)"
fi

# Production 환경에서 삭제 (필요한 경우)
read -p "Production 환경에서도 삭제하시겠습니까? (y/N): " confirm
if [[ $confirm == [yY] ]]; then
    echo "Production 환경에서 삭제 중..."
    if vercel env remove JWT_SECRET production --yes 2>/dev/null; then
        echo "✅ Production에서 삭제 성공"
    else
        echo "❌ Production에서 삭제 실패 (또는 이미 없음)"
    fi
fi

echo -e "\n4. 삭제 후 상태 확인:"
vercel env ls | grep JWT_SECRET || echo "✅ JWT_SECRET이 완전히 삭제되었습니다"

echo -e "\n5. 캐시 정리:"
rm -rf .vercel-env-cache
echo "✅ 캐시가 정리되었습니다"

echo -e "\n🎉 완료! 이제 env-sync 스크립트가 정상 작동할 것입니다." 