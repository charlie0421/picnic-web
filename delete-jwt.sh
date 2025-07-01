#!/bin/bash

echo "🗑️ JWT_SECRET 삭제 스크립트"
echo "=========================="

# 현재 JWT_SECRET 상태 확인
echo "현재 JWT_SECRET 상태:"
vercel env ls | grep JWT_SECRET || echo "JWT_SECRET이 없습니다"

echo ""
echo "JWT_SECRET을 모든 환경에서 삭제합니다..."

# Development 환경에서 삭제
if vercel env remove JWT_SECRET development --yes 2>/dev/null; then
    echo "✅ Development 환경에서 JWT_SECRET 삭제 성공"
else
    echo "❌ Development 환경에서 JWT_SECRET 삭제 실패 (또는 이미 없음)"
fi

# Preview 환경에서 삭제
if vercel env remove JWT_SECRET preview --yes 2>/dev/null; then
    echo "✅ Preview 환경에서 JWT_SECRET 삭제 성공"
else
    echo "❌ Preview 환경에서 JWT_SECRET 삭제 실패 (또는 이미 없음)"
fi

# Production 환경에서 삭제 (필요한 경우)
if vercel env remove JWT_SECRET production --yes 2>/dev/null; then
    echo "✅ Production 환경에서 JWT_SECRET 삭제 성공"
else
    echo "❌ Production 환경에서 JWT_SECRET 삭제 실패 (또는 이미 없음)"
fi

echo ""
echo "삭제 후 상태:"
vercel env ls | grep JWT_SECRET || echo "✅ JWT_SECRET이 완전히 삭제되었습니다"

echo ""
echo "🎉 완료!" 