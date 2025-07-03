# Translation Management

이 디렉토리에는 번역 관리 관련 파일들이 포함되어 있습니다.

## 현재 번역 시스템

프로젝트는 **로컬 번역 파일 기반** 시스템을 사용합니다:

- 번역 파일 위치: `public/locales/`
- 지원 언어: `ko`, `en`, `ja`, `zh`, `id`
- 번역 로더: `stores/languageStore.ts`
- UI 동기화: `components/providers/LanguageSyncProvider.tsx`

## 번역 키 관리

### 새로운 번역 키 추가

1. **번역 키 사용**
   ```typescript
   const { t } = useLanguageStore();
   t('new_translation_key'); // 새로운 키 사용
   ```

2. **번역 파일에 키 추가**
   - `public/locales/ko.json`에 한국어 번역 추가
   - `public/locales/en.json`에 영어 번역 추가
   - 기타 언어 파일에도 추가

### 지원하는 번역 키 패턴

- `t('translation_key')`
- `t("translation_key")`
- `getText('translation_key')`

### 번역 키 규칙

- 영문, 숫자, 언더스코어, 점(.)만 사용
- 계층 구조는 점(.)으로 구분: `dialog.confirm.title`
- 명확하고 설명적인 이름 사용

## 지원 언어

| 코드 | 언어 |
|------|------|
| `ko` | 한국어 (기본) |
| `en` | 영어 |
| `ja` | 일본어 |
| `zh` | 중국어 간체 |
| `id` | 인도네시아어 |

## 주의사항

- 동적으로 생성되는 키는 지원되지 않음
- 번역이 없는 경우 개발 환경에서는 `[key]` 형태로 표시
- 프로덕션에서는 빈 문자열 반환 