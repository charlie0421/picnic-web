# Translation Scripts

이 디렉토리에는 번역 관련 스크립트와 생성된 분석 파일들이 포함되어 있습니다.

## 스크립트

### `sync-translations.js`

Crowdin에서 번역을 동기화하고 누락된 번역 키를 분석하는 메인 스크립트입니다.

#### 기능

1. **Crowdin 동기화**: Crowdin에서 최신 번역을 가져와서 `public/locales/`에 저장
2. **코드 분석**: 프로젝트 코드에서 사용되는 번역 키를 자동으로 추출
3. **누락 키 탐지**: 코드에서 사용되지만 번역 파일에 없는 키들을 찾아냄
4. **분석 리포트 생성**: 상세한 분석 결과를 JSON 파일로 저장
5. **번역 템플릿 생성**: 누락된 키들에 대한 번역 템플릿 제공

#### 사용법

```bash
# 기본 동기화
npm run sync-translations

# 동기화 결과를 파일로 저장
npm run sync-translations:save
```

#### 환경 변수

- `NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH`: Crowdin OTA 배포 해시 (필수)
- `SAVE_SYNC_RESULTS`: 동기화 결과를 JSON 파일로 저장할지 여부 (선택)

### `check-missing-keys.js`

이전 분석 결과를 기반으로 누락된 번역 키를 빠르게 확인하는 스크립트입니다.

#### 기능

1. **요약 정보 표시**: 번역 키 통계를 간단히 보여줌
2. **누락된 키 나열**: 코드에서 사용되지만 번역되지 않은 키 목록
3. **다음 단계 안내**: 누락된 키를 해결하는 방법 제시
4. **정리 권장사항**: 사용되지 않는 키에 대한 정리 권장

#### 사용법

```bash
# 누락된 키 빠르게 확인
npm run check-translations
```

#### 환경 변수

## 생성되는 파일들

### `translation-analysis-report.json`

번역 키 분석의 상세한 결과를 포함하는 리포트 파일입니다.

```json
{
  "generatedAt": "2025-05-30T11:20:15.119Z",
  "summary": {
    "totalUsedKeys": 53,
    "totalExistingKeys": 484,
    "missingKeysCount": 32,
    "newKeysToAddCount": 32,
    "unusedKeysCount": 2300
  },
  "details": {
    "missingKeys": ["key1", "key2", ...],
    "unusedKeys": {
      "ko": ["unused_key1", ...],
      "en": ["unused_key1", ...]
    },
    "newKeysToAdd": ["new_key1", "new_key2", ...],
    "keysInCrowdinNotLocal": ["crowdin_key1", ...]
  }
}
```

### `missing-keys-template.json`

누락된 번역 키들과 각 언어별 기본 번역을 제공하는 템플릿 파일입니다.

```json
{
  "note": "이 키들을 Crowdin에 추가해야 합니다",
  "generatedAt": "2025-05-30T11:20:15.119Z",
  "missingKeys": {
    "button_go_to_home": {
      "ko": "홈으로 가기",
      "en": "Go to Home",
      "ja": "ホームに戻る",
      "zh": "回到首页",
      "id": "Kembali ke Beranda"
    }
  }
}
```

### `last-sync-result.json` (선택적)

`SAVE_SYNC_RESULTS=true`로 실행했을 때 생성되는 동기화 결과 파일입니다.

## 워크플로우

1. **개발 중 새로운 번역 키 사용**
   ```typescript
   const { t } = useLanguageStore();
   t('new_translation_key'); // 새로운 키 사용
   ```

2. **번역 동기화 및 분석 실행**
   ```bash
   npm run sync-translations
   ```

3. **누락된 키 확인**
   - 터미널 출력에서 누락된 키 목록 확인
   - `missing-keys-template.json` 파일에서 상세 번역 확인

4. **Crowdin에 누락된 키 추가**
   - `missing-keys-template.json`의 내용을 참고하여 Crowdin에 키 추가
   - 또는 직접 번역 파일에 키 추가 후 Crowdin 업로드

5. **재동기화**
   - Crowdin 업데이트 후 다시 `npm run sync-translations` 실행

## 지원하는 번역 키 패턴

스크립트는 다음과 같은 패턴의 번역 키 사용을 자동으로 감지합니다:

- `t('translation_key')`
- `t("translation_key")`
- `getText('translation_key')`
- `$t('translation_key')`

## 지원 언어

- `ko` (한국어)
- `en` (영어)
- `ja` (일본어)
- `zh` (중국어 간체)
- `id` (인도네시아어)

## 주의사항

- 번역 키는 영문, 숫자, 언더스코어, 점(.)만 사용 가능합니다
- 동적으로 생성되는 키 (템플릿 리터럴 등)는 감지되지 않습니다
- 스크립트 실행 전에 `NEXT_PUBLIC_CROWDIN_DISTRIBUTION_HASH` 환경 변수가 설정되어 있어야 합니다 