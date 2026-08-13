# Multi-stage Dockerfile for Next.js app (production runtime)

FROM node:20-alpine AS builder
WORKDIR /app

# Build deps for native modules
RUN apk add --no-cache python3 make g++ libc6-compat

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build (avoid running npm postbuild hooks)
ENV NEXT_TELEMETRY_DISABLED=1

# Accept build-time public envs for client bundle
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_WEB_DOMAIN
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_WEB_DOMAIN=${NEXT_PUBLIC_WEB_DOMAIN}

# 배포 스큐 보호용 식별자. 배포 단위로 불변인 값을 받아 빌드와 런타임에 **같은 값**을
# 쓴다. Next 는 next.config.js 에 deploymentId 가 없으면 이 환경변수를 읽는다.
#
# 한 배포의 모든 인스턴스가 동일한 값을 가져야 한다. 런타임에 값을 생성하면
# 컨테이너마다 달라져 클라이언트/서버가 영구 불일치 상태가 된다.
#
# 보장 범위를 정확히 해둔다. 이 값은 스큐를 **감지**해 하드 내비게이션을 유발하고
# 정적 자산의 캐시를 무효화한다. 이전 배포로 요청을 **라우팅하지는 않는다** —
# Next 는 들어오는 ?dpl= 을 읽지 않는다. 따라서 롤링 배포로 이전 태스크가 drain 된
# 뒤 오래된 탭이 사라진 청크를 요청하면 404 다. 그 보존/라우팅은 ALB/CDN 계층의
# 별도 작업이다.
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID}

RUN npm run gen:types || true
# Fallback: ensure types/supabase.ts is a valid module even if generation failed
RUN mkdir -p types && [ -s types/supabase.ts ] || echo 'export type Database = any;' > types/supabase.ts
RUN npx next build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# next start 는 next.config.js 를 다시 읽는다. 빌드 때와 동일한 배포 ID 를
# 런타임에도 주지 않으면 서버가 클라이언트 번들과 다른 ID 를 광고한다.
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=${NEXT_DEPLOYMENT_ID}

# Copy minimal runtime artifacts
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["sh", "-c", "node node_modules/next/dist/bin/next start -p ${PORT:-3000}"]


