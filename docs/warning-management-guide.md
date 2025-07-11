# 📋 빌드 경고 관리 가이드

이 문서는 Picnic Web 프로젝트의 빌드 과정에서 발생할 수 있는 경고들과 해결 방법을 안내합니다.

## 🔍 주요 경고 유형

### 1. npm 보안 취약점 경고

```bash
4 low severity vulnerabilities
To address all issues (including breaking changes), run:
  npm audit fix --force
```

**해결 방법:**
```bash
# 현재 취약점 확인
npm run audit

# 안전한 자동 수정 (breaking change 없음)
npm run audit:fix

# 모든 취약점 강제 수정 (주의: breaking change 가능)
npm run audit:fix-force

# moderate 이상 심각도만 확인
npm run audit:report

# 전체 보안 체크
npm run security:check
```

**권장사항:**
- `low severity` 취약점은 즉시 수정하지 않아도 됨
- `moderate` 이상 취약점은 우선적으로 해결
- `npm audit fix --force` 사용 전 충분한 테스트 필요

### 2. Sentry 릴리스 경고

```bash
⚠️ set-commits 실패: git 정보가 없을 수 있습니다.
```

**원인 및 해결:**
- Vercel 배포 환경에서 git 정보 부족
- 현재 fallback 로직으로 `--auto` 옵션 사용하여 안전하게 처리됨
- 기능에는 영향 없음

### 3. Source Map 경고

```bash
warning: could not determine a source map reference for ~/_next/server/app/[lang]/page_client-reference-manifest.js
```

**해결된 내용:**
- `next.config.js`에 `productionBrowserSourceMaps: true` 추가
- Sentry 업로드에서 manifest 파일들 제외 처리
- 경고 수 대폭 감소

## 🛠️ 정기 유지보수

### 주간 체크리스트

```bash
# 1. 보안 취약점 확인
npm run security:check

# 2. 패키지 업데이트 확인
npm outdated

# 3. 테스트 실행
npm test

# 4. 빌드 테스트
npm run build
```

### 월간 체크리스트

```bash
# 1. 주요 패키지 업데이트 검토
npm outdated | grep -E "(next|react|@auth|@supabase)"

# 2. 보안 취약점 전체 검토
npm audit

# 3. Dependency 정리
npm prune
```

## 🚨 긴급 대응

### High/Critical 취약점 발견 시

1. **즉시 영향도 분석**
   ```bash
   npm audit --audit-level=high
   ```

2. **격리된 환경에서 테스트**
   ```bash
   git checkout -b security-fix-$(date +%Y%m%d)
   npm audit fix
   npm test
   npm run build
   ```

3. **검증 후 배포**
   - staging 환경 배포 및 테스트
   - production 배포
   - 모니터링 강화

### 빌드 실패 시

1. **로그 분석**
   - Vercel 빌드 로그 확인
   - Sentry 에러 로그 확인

2. **로컬 재현**
   ```bash
   npm ci  # clean install
   npm run build
   ```

3. **단계별 해결**
   - 패키지 의존성 문제 → `npm audit fix`
   - TypeScript 오류 → 타입 정의 수정
   - 환경변수 문제 → `.env` 설정 확인

## 📈 모니터링

### 빌드 품질 지표

- **빌드 시간**: 3분 이내 목표
- **번들 크기**: First Load JS < 250kB
- **보안 취약점**: Critical/High 0개 유지
- **테스트 커버리지**: 80% 이상 유지

### 알림 설정

- Vercel 빌드 실패 → Slack 알림
- npm audit critical → GitHub Issues 자동 생성
- Sentry 에러율 증가 → 담당자 이메일 알림

## 📚 참고 자료

- [npm audit 공식 문서](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Next.js 보안 가이드](https://nextjs.org/docs/advanced-features/security-headers)
- [Sentry 릴리스 관리](https://docs.sentry.io/product/releases/)
- [Vercel 빌드 최적화](https://vercel.com/docs/concepts/builds)

---

**🔄 마지막 업데이트**: 2025년 7월 11일  
**📝 작성자**: Development Team  
**�� 검토자**: DevOps Team 