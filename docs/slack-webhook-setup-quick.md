# 🚀 빠른 Slack Webhook 설정

## 1. Slack Webhook URL 생성 (5분)

1. **Slack API 접속**: https://api.slack.com/apps
2. **"Create New App"** 클릭
3. **"From scratch"** 선택
4. **App Name**: `Picnic Deployment Bot`
5. **Workspace**: 본인의 워크스페이스 선택
6. **"Create App"** 클릭

7. **왼쪽 메뉴** → **"Incoming Webhooks"** 클릭
8. **"Activate Incoming Webhooks"** 토글을 **ON**으로 변경
9. **"Add New Webhook to Workspace"** 클릭
10. **알림받을 채널 선택** (예: #deployments, #general)
11. **"Allow"** 클릭

12. **Webhook URL 복사** (예: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX`)

## 2. GitHub Secrets 설정 (2분)

1. **GitHub 저장소** → **Settings** 탭
2. **좌측 메뉴** → **Secrets and variables** → **Actions**
3. **"New repository secret"** 클릭
4. **Name**: `SLACK_WEBHOOK_URL`
5. **Secret**: 위에서 복사한 Webhook URL 붙여넣기
6. **"Add secret"** 클릭

## 3. 테스트 명령어

```bash
# Webhook URL 테스트
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"🧪 Picnic 배포 알림 테스트!"}' \
  YOUR_WEBHOOK_URL
```

✅ **설정 완료!** 이제 코드를 푸시하면 Slack 알림을 받을 수 있습니다. 