#!/bin/bash
echo "새 Sentry 토큰으로 업데이트하는 스크립트입니다."
echo "사용법: ./update-sentry-token.sh [새_토큰]"
echo ""
if [ -z "$1" ]; then
  echo "❌ 토큰을 인수로 제공해주세요."
  echo "예: ./update-sentry-token.sh sntrys_새토큰..."
  exit 1
fi

NEW_TOKEN="$1"

# .env.local 업데이트
sed -i "" "s/SENTRY_AUTH_TOKEN=.*/SENTRY_AUTH_TOKEN=$NEW_TOKEN/" .env.local
echo "✅ .env.local 업데이트 완료"

# .sentryclirc 업데이트  
sed -i "" "s/token=.*/token=$NEW_TOKEN/" .sentryclirc
echo "✅ .sentryclirc 업데이트 완료"

echo ""
echo "🧪 테스트 중..."
source .env.local && npx sentry-cli organizations list

