# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build backend
FROM node:20-bookworm-slim AS backend-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/ .
RUN npm run build

# Stage 3: Production
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=backend-build /app/server/dist ./server/dist
COPY --from=backend-build /app/server/node_modules ./server/node_modules
COPY --from=backend-build /app/server/package.json ./server/
COPY --from=backend-build /app/server/views ./server/views
COPY --from=frontend-build /app/dist ./dist

RUN mkdir -p /app/server/data

ENV PORT=3001
ENV NEW_API_URL=http://127.0.0.1:3000
ENV ADMIN_PASSWORD=admin123
ENV BUILTIN_API_KEY=
ENV DB_PATH=/app/server/data/playground.db
ENV GLOBAL_DAILY_LIMIT=1000
ENV PER_USER_DAILY_LIMIT=10
ENV PER_USER_UNVERIFIED_LIMIT=3
ENV AFF_BONUS=10
ENV SMTP_HOST=smtpdm.aliyun.com
ENV SMTP_PORT=465
ENV SMTP_USER=admini@notify.moyuu.cc
ENV SMTP_PASS=
ENV SMTP_FROM=admini@notify.moyuu.cc

VOLUME /app/server/data

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
