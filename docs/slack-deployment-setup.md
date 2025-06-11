# Slack 배포 알림 설정 가이드

이 문서는 Picnic Web 프로젝트의 Vercel 배포 시 Slack으로 알림을 받기 위한 설정 방법을 안내합니다.

## 🚀 기능

- **배포 시작 알림**: 코드가 `main` 또는 `production` 브랜치에 푸시될 때 배포 시작을 알림
- **배포 완료 알림**: 배포가 성공적으로 완료되면 알림 (헬스체크 포함)
- **배포 실패 알림**: 배포가 실패하거나 사이트가 응답하지 않을 때 알림
- **환경별 구분**: Development(main), Production(production) 환경 구분
- **상세 정보**: 커밋 메시지, 작성자, SHA, 배포 URL 등 포함

## 📋 사전 준비

### 1. Slack Webhook URL 생성

1. [Slack API](https://api.slack.com/apps)에 접속
2. "Create New App" 클릭
3. "From scratch" 선택
4. 앱 이름 입력 (예: "Picnic Deployment Notifier")
5. 워크스페이스 선택
6. "Incoming Webhooks" 섹션으로 이동
7. "Activate Incoming Webhooks" 토글 켜기
8. "Add New Webhook to Workspace" 클릭
9. 알림을 받을 채널 선택
10. 생성된 Webhook URL 복사

### 2. GitHub Secrets 설정

1. GitHub 저장소 페이지로 이동
2. Settings > Secrets and variables > Actions 클릭
3. "New repository secret" 클릭
4. Name: `SLACK_WEBHOOK_URL`
5. Secret: 위에서 복사한 Webhook URL 입력
6. "Add secret" 클릭

## 🔧 설정 커스터마이징

### 배포 URL 수정

현재 설정된 URL을 실제 프로젝트 URL로 변경하세요:

```yaml
# .github/workflows/vercel-deployment-notification.yml 파일에서
if [ "${{ github.ref_name }}" = "main" ]; then
  echo "deployment_url=https://your-dev-url.vercel.app" >> $GITHUB_OUTPUT
else
  echo "deployment_url=https://your-production-url.vercel.app" >> $GITHUB_OUTPUT
fi
```

### 대기 시간 조정

빌드 시간에 따라 대기 시간을 조정할 수 있습니다:

```yaml
- name: Wait for deployment
  run: sleep 300  # 초 단위 (현재 5분)
```

### 브랜치 설정

다른 브랜치에서도 알림을 받으려면:

```yaml
on:
  push:
    branches: [main, production, develop]  # 브랜치 추가
```

### 알림 메시지 커스터마이징

Slack 메시지의 텍스트나 색상을 변경할 수 있습니다:

```yaml
custom_payload: |
  {
    "text": "🚀 Your Custom Message!",
    "attachments": [
      {
        "color": "#36a64f",  # 색상 변경
        "fields": [
          // 필드 커스터마이징
        ]
      }
    ]
  }
```

## 🎨 Slack 메시지 스타일

### 색상 코드
- 🟠 시작: `#ffaa00` (주황색)
- 🟢 성공: `good` (녹색)
- 🔴 실패: `danger` (빨간색)

### 이모지 가이드
- 🚀 배포 시작
- ✅ 성공
- ❌ 실패
- ⏳ 진행 중
- 🎉 완료

## 🔍 트러블슈팅

### 알림이 오지 않는 경우

1. **Slack Webhook URL 확인**
   ```bash
   # GitHub Secrets에 올바른 URL이 설정되어 있는지 확인
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message"}' \
     YOUR_WEBHOOK_URL
   ```

2. **워크플로우 실행 확인**
   - GitHub Actions 탭에서 워크플로우 실행 상태 확인
   - 에러 로그 검토

3. **권한 확인**
   - Slack 앱이 해당 채널에 메시지를 보낼 권한이 있는지 확인

### 배포 상태 확인 실패

헬스체크가 실패하는 경우:

1. **URL 확인**: 실제 배포 URL이 올바른지 확인
2. **응답 시간**: 사이트 로딩이 느린 경우 대기 시간 증가
3. **CORS/인증**: API 엔드포인트 대신 메인 페이지 URL 사용

## 📊 모니터링

### GitHub Actions에서 확인할 수 있는 정보

- 워크플로우 실행 시간
- 각 단계별 로그
- 배포 상태 및 응답 코드
- Slack API 응답

### Slack에서 확인할 수 있는 정보

- 배포 환경 (Development/Production)
- 커밋 정보 (메시지, 작성자, SHA)
- 배포 URL 링크
- 소요 시간
- 성공/실패 상태

## 🔄 추가 기능

필요에 따라 다음 기능들을 추가할 수 있습니다:

1. **테스트 결과 포함**: 테스트 통과/실패 정보
2. **성능 메트릭**: 빌드 시간, 번들 크기 등
3. **환경 변수 알림**: 중요한 설정 변경 사항
4. **롤백 알림**: 배포 실패 시 자동 롤백 알림

## 📞 지원

설정 중 문제가 발생하면:

1. GitHub Actions 로그 확인
2. Slack Webhook 테스트
3. 워크플로우 파일 문법 검증

---

**참고**: 이 설정은 Vercel의 자동 배포를 기반으로 하며, 실제 배포 완료 시점을 정확히 감지하기 위해 헬스체크를 포함합니다. 