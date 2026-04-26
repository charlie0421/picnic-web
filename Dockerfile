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

RUN npm run gen:types || true
# Fallback: ensure types/supabase.ts is a valid module even if generation failed
RUN mkdir -p types && [ -s types/supabase.ts ] || echo 'export type Database = any;' > types/supabase.ts
RUN npx next build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

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


