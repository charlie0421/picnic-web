# 배포 및 롤백 가이드

## 이미지 태그 배포

```bash
# 글로벌
scripts/deploy-ecr-ecs.sh global <tag>

# 중국
scripts/deploy-ecr-ecs.sh cn <tag>
```

## 현재 서비스/태스크 정의 확인

```bash
# 글로벌
aws ecs describe-services \
  --cluster picnic-fan-gl-cluster \
  --services picnic-fan-gl-edge-svc \
  --region ap-northeast-2 --profile aws-global | jq '.services[0].taskDefinition'

# 중국
aws ecs describe-services \
  --cluster picnic-fan-cn-cluster \
  --services picnic-fan-cn-edge-svc \
  --region cn-north-1 --profile aws-cn | jq '.services[0].taskDefinition'
```

## 롤백 (이전 리비전으로 복구)

1) 되돌릴 태스크 정의 리비전 확인

```bash
# 예: 마지막 5개 리비전 조회
aws ecs list-task-definitions \
  --family-prefix picnic-fan-gl-edge \
  --region ap-northeast-2 --profile aws-global \
  | jq -r '.taskDefinitionArns[-5:][]'
```

2) 서비스에 특정 리비전 적용

```bash
# 글로벌 예시 (리비전 5로 롤백)
aws ecs update-service \
  --cluster picnic-fan-gl-cluster \
  --service picnic-fan-gl-edge-svc \
  --task-definition picnic-fan-gl-edge:5 \
  --force-new-deployment \
  --region ap-northeast-2 --profile aws-global
```

## 참고
- `scripts/deploy-ecr-ecs.sh`는 기존 태스크 정의를 기반으로 컨테이너 이미지 경로만 새 태그로 갱신하여 새 리비전을 등록합니다.
- Next.js 런타임 포트는 환경변수 `PORT`를 따릅니다(태스크 정의에 9000 설정됨).
