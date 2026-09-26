#!/bin/sh
# 원격 PICNIC-PROD 스키마로 types/supabase.ts 와 생성 인터페이스를 갱신한다.
# 스키마 소유는 picnic-supabase 레포다 — 마이그레이션 머지·배포 후 이 명령으로 타입만 동기화한다.
# 생성 실패·빈 출력이면 기존 파일을 보존한다.
set -eu

PROJECT_ID="xtijtefcycoeqludlngc"
tmp=$(mktemp "${TMPDIR:-/tmp}/supabase-types.XXXXXX")
trap 'rm -f "$tmp"' EXIT

echo "🚀 Supabase 타입 생성 중 (project: $PROJECT_ID)..."
supabase gen types typescript --project-id "$PROJECT_ID" > "$tmp"

if ! grep -q "export type Database" "$tmp"; then
  echo "❌ 생성 결과에 'export type Database' 가 없습니다 — types/supabase.ts 를 그대로 둡니다." >&2
  exit 1
fi

mv "$tmp" types/supabase.ts
trap - EXIT
echo "✅ types/supabase.ts 갱신"

echo "🚀 인터페이스 생성 중..."
tsx scripts/generate-interfaces.ts
echo "✅ 완료 — git diff types/ 로 변경을 확인하고 커밋하세요."
