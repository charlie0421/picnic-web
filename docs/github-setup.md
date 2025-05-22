# GitHub 저장소 설정 가이드

## 브랜치 보호 규칙 설정

프로젝트 품질을 유지하고 CI 테스트 및 코드 커버리지 확인이 항상 실행되도록 하려면 GitHub 저장소에 브랜치 보호 규칙을 설정해야 합니다.

### 1. 브랜치 보호 규칙 추가

1. GitHub 저장소 페이지로 이동합니다.
2. 상단 메뉴에서 `Settings` 탭을 클릭합니다.
3. 왼쪽 사이드바에서 `Branches`를 클릭합니다.
4. `Branch protection rules` 섹션에서 `Add rule` 버튼을 클릭합니다.
5. `Branch name pattern`에 `main`을 입력합니다. (프로덕션 브랜치에도 동일한 규칙을 적용하려면 별도로 설정해야 합니다)

### 2. 필수 상태 체크 구성

브랜치 보호 규칙 설정 페이지에서 다음 옵션을 활성화합니다:

1. `Require a pull request before merging` 체크박스를 선택합니다.
   - `Require approvals` 체크박스를 선택하고 필요한 리뷰어 수를 설정합니다 (권장: 1명 이상).

2. `Require status checks to pass before merging` 체크박스를 선택합니다. 
   - `Status checks that are required` 검색창에서 `test`를 검색하면 GitHub Actions 워크플로우가 표시됩니다.
   - `Test and Coverage` 체크박스를 선택합니다.

3. 필요에 따라 다음 옵션도 고려할 수 있습니다:
   - `Require branches to be up to date before merging`: 병합 전 브랜치가 최신 상태인지 확인합니다.
   - `Require linear history`: 병합 대신 리베이스를 강제하려면 선택합니다.
   - `Do not allow bypassing the above settings`: 관리자도 규칙을 우회할 수 없게 합니다.

4. 설정이 완료되면 `Create` 또는 `Save changes` 버튼을 클릭합니다.

## Codecov 설정

Codecov와 통합하여 코드 커버리지 보고서를 시각화하려면 다음 단계를 따릅니다:

1. [Codecov](https://codecov.io/)에 GitHub 계정으로 로그인합니다.
2. 저장소를 추가합니다.
3. Codecov에서 제공하는 토큰을 복사합니다.
4. GitHub 저장소 설정의 `Secrets and variables` > `Actions`로 이동합니다.
5. `New repository secret` 버튼을 클릭합니다.
6. 이름에 `CODECOV_TOKEN`을 입력하고, 값에 복사한 토큰을 붙여넣습니다.
7. `Add secret` 버튼을 클릭합니다.

## PR 템플릿 설정 (선택 사항)

PR 작성 시 테스트 및 코드 커버리지에 관한 정보를 포함하도록 PR 템플릿을 설정할 수 있습니다:

1. 저장소 루트에 `.github/pull_request_template.md` 파일을 생성합니다.
2. 다음 내용을 추가합니다:

```markdown
## 변경 사항 설명

## 테스트 여부
- [ ] 테스트가 추가되었습니다.
- [ ] 모든 테스트가 통과합니다.
- [ ] 코드 커버리지가 감소하지 않았습니다.

## 스크린샷 (필요한 경우)

## 기타 정보
```

이 설정들을 통해 GitHub 저장소에서 PR이 병합되기 전에 자동으로 테스트가 실행되고 코드 커버리지가 확인됩니다. 테스트가 실패하거나 코드 커버리지 임계값을 충족하지 못하면 PR 병합이 차단됩니다. 