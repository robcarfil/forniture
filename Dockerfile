FROM node:20-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG APP_VERSION=1.3.3
ENV NEXT_PUBLIC_APP_VERSION=$APP_VERSION

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

LABEL org.opencontainers.image.title="Forniture"
LABEL org.opencontainers.image.description="Forniture with authentication and user management"
LABEL org.opencontainers.image.version="1.3.3"

WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1

CMD ["node", "server.js"]
