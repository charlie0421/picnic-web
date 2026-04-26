#!/bin/sh
set -euo pipefail

# Usage:
#   scripts/deploy-ecr-ecs.sh <env> <tag>
# env: global|cn
# tag: image tag (e.g., v1.0.0 or commit sha)

ENV_TARGET="${1:-}"
IMAGE_TAG="${2:-}"

if [ -z "$ENV_TARGET" ] || [ -z "$IMAGE_TAG" ]; then
  echo "Usage: $0 <global|cn> <tag>"
  exit 1
fi

# Which container in the task definition to update (default: web)
CONTAINER_NAME="${CONTAINER_NAME:-web}"

if [ "$ENV_TARGET" = "global" ]; then
  AWS_PROFILE="${AWS_PROFILE:-aws-global}"
  AWS_REGION="${AWS_REGION:-ap-northeast-2}"
  ACCOUNT_ID="${ACCOUNT_ID:-851725635868}"
  REPO_URI="${REPO_URI:-${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/picnic-web}"
  # sensible defaults inferred from profile naming
  ECS_CLUSTER="${ECS_CLUSTER:-picnic-fan-gl-cluster}"
  ECS_SERVICE="${ECS_SERVICE:-picnic-fan-gl-web-svc}"
  TD_FAMILY="${TD_FAMILY:-picnic-fan-gl-web}"
  ARCH_HINT="${ARCH_HINT:-arm64}"
elif [ "$ENV_TARGET" = "cn" ]; then
  AWS_PROFILE="${AWS_PROFILE:-aws-cn}"
  AWS_REGION="${AWS_REGION:-cn-north-1}"
  ACCOUNT_ID="${ACCOUNT_ID:-606940464839}"
  REPO_URI="${REPO_URI:-${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com.cn/picnic-web}"
  # sensible defaults inferred from profile naming
  ECS_CLUSTER="${ECS_CLUSTER:-picnic-fan-cn-cluster}"
  ECS_SERVICE="${ECS_SERVICE:-picnic-fan-cn-web-svc}"
  TD_FAMILY="${TD_FAMILY:-picnic-fan-cn-web}"
  ARCH_HINT="${ARCH_HINT:-x64}"
else
  echo "Unknown env: $ENV_TARGET (expected: global|cn)"
  exit 1
fi

# Require explicit ECS identifiers (avoid accidental edge updates)
if [ -z "$TD_FAMILY" ] || [ -z "$ECS_SERVICE" ] || [ -z "$ECS_CLUSTER" ]; then
  echo "Error: TD_FAMILY, ECS_SERVICE, and ECS_CLUSTER must be provided via environment variables for $ENV_TARGET."
  echo "Example: TD_FAMILY=picnic-web-gl TD_ECS_SERVICE=picnic-web-gl-svc ECS_CLUSTER=picnic-web-gl-cluster CONTAINER_NAME=web $0 $ENV_TARGET $IMAGE_TAG"
  exit 1
fi

# 1) ECR login
aws ecr get-login-password --region "$AWS_REGION" --profile "$AWS_PROFILE" | \
  docker login --username AWS --password-stdin "$(echo "$REPO_URI" | sed 's#/picnic-web##')"

# 2) Build image (prefer buildx --push to reduce local disk usage)
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  if [ "$ARCH_HINT" = "arm64" ]; then
    PLATFORM="linux/arm64"
  else
    PLATFORM="linux/amd64"
  fi

  BUILD_ARGS=""
  [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && BUILD_ARGS="$BUILD_ARGS --build-arg NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}"
  [ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ] && BUILD_ARGS="$BUILD_ARGS --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
  [ -n "${NEXT_PUBLIC_WEB_DOMAIN:-}" ] && BUILD_ARGS="$BUILD_ARGS --build-arg NEXT_PUBLIC_WEB_DOMAIN=${NEXT_PUBLIC_WEB_DOMAIN}"

  if docker buildx version >/dev/null 2>&1; then
    # Ensure a builder exists
    docker buildx create --use --name picnic-tmp >/dev/null 2>&1 || docker buildx use picnic-tmp
    docker buildx build \
      --platform "$PLATFORM" \
      -t "${REPO_URI}:${IMAGE_TAG}" \
      -f Dockerfile \
      $BUILD_ARGS \
      --push \
      .
  else
    # Fallback to classic build (may require disk space)
    DOCKER_DEFAULT_PLATFORM=${DOCKER_DEFAULT_PLATFORM:-}
    if [ -z "$DOCKER_DEFAULT_PLATFORM" ]; then
      export DOCKER_DEFAULT_PLATFORM="$PLATFORM"
    fi
    # shellcheck disable=SC2086
    docker build -t "${REPO_URI}:${IMAGE_TAG}" -f Dockerfile $BUILD_ARGS .
    docker push "${REPO_URI}:${IMAGE_TAG}"
  fi
fi

# 3) Register new task definition revision by updating image
CURRENT_TD_JSON=$(aws ecs describe-task-definition \
  --task-definition "$TD_FAMILY" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE")

NEW_TD_JSON=$(echo "$CURRENT_TD_JSON" | \
  CONTAINER_NAME="$CONTAINER_NAME" NEW_IMAGE="${REPO_URI}:${IMAGE_TAG}" node -e '
    const fs = require("fs");
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    const td = input.taskDefinition;
    // sanitize fields not allowed on register
    delete td.taskDefinitionArn;
    delete td.revision;
    delete td.status;
    delete td.registeredAt;
    delete td.registeredBy;
    delete td.requiresAttributes;
    delete td.compatibilities;

    // update image
    const newImage = process.env.NEW_IMAGE;
    const containerName = process.env.CONTAINER_NAME || "web";
    let hit = false;
    td.containerDefinitions = td.containerDefinitions.map(c => {
      if (c.name === containerName) {
        c.image = newImage;
        hit = true;
      }
      return c;
    });
    if (!hit) {
      console.error(`Container name not found in task definition: ${containerName}`);
      process.exit(2);
    }

    process.stdout.write(JSON.stringify({
      family: td.family,
      taskRoleArn: td.taskRoleArn,
      executionRoleArn: td.executionRoleArn,
      networkMode: td.networkMode,
      containerDefinitions: td.containerDefinitions,
      volumes: td.volumes,
      placementConstraints: td.placementConstraints,
      requiresCompatibilities: td.requiresCompatibilities,
      cpu: td.cpu,
      memory: td.memory,
      runtimePlatform: td.runtimePlatform
    }));
  ')

TD_FILE=$(mktemp)
printf "%s" "$NEW_TD_JSON" > "$TD_FILE"

REGISTERED=$(aws ecs register-task-definition \
  --cli-input-json file://"$TD_FILE" \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE")

rm -f "$TD_FILE"

NEW_TD_ARN=$(echo "$REGISTERED" | node -e 'const fs=require("fs");const o=JSON.parse(fs.readFileSync(0,"utf8"));console.log(o.taskDefinition.taskDefinitionArn)')

echo "Registered TD: $NEW_TD_ARN"

# 4) Update service
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$NEW_TD_ARN" \
  --force-new-deployment \
  --region "$AWS_REGION" \
  --profile "$AWS_PROFILE" | cat

echo "Done: $ENV_TARGET -> ${REPO_URI}:${IMAGE_TAG} (container=${CONTAINER_NAME})"
