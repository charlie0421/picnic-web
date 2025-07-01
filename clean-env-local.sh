#!/bin/bash

echo "=== .env.local 파일 정리 ==="

echo "1. 현재 상태:"
echo "   총 라인 수: $(wc -l < .env.local)"
echo "   환경변수 수: $(grep -E '^[A-Z_]' .env.local | wc -l)"

echo -e "\n2. 빈 값 변수들 확인:"
grep -E '^[A-Z_][A-Z0-9_]*=$' .env.local | while read line; do
    echo "   - $line"
done

echo -e "\n3. 백업 생성..."
cp .env.local .env.local.backup

echo -e "\n4. 정리 중..."
# 빈 값 제거 (KEY= 형태)
sed -i '' '/^[A-Z_][A-Z0-9_]*=$/d' .env.local

# 빈 줄 제거
sed -i '' '/^[[:space:]]*$/d' .env.local

# 주석 라인은 유지하되 정리
grep -v '^[[:space:]]*#' .env.local > .env.local.clean
mv .env.local.clean .env.local

echo -e "\n5. 정리 후 상태:"
echo "   총 라인 수: $(wc -l < .env.local)"
echo "   환경변수 수: $(grep -E '^[A-Z_]' .env.local | wc -l)"

echo -e "\n6. 차이점 확인 (정리된 것들):"
echo "   제거된 변수들:"
comm -23 <(grep -E '^[A-Z_]' .env.local.backup | cut -d'=' -f1 | sort) <(grep -E '^[A-Z_]' .env.local | cut -d'=' -f1 | sort) | while read var; do
    echo "     - $var"
done

echo -e "\n=== 정리 완료 ==="
echo "백업 파일: .env.local.backup" 